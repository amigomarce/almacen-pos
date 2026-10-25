/**
 * Qué sabe el sistema de un código escaneado, en este orden:
 * 1. Código de balanza (prefijos 20–29) → solo productos del local, por `scale_code`.
 * 2. Productos del local (`products.barcode` y códigos alternativos en `product_barcodes`).
 * 3. Base semilla (`seed.sqlite`).
 * 4. Open Food Facts en línea (opcional; nunca bloquea la caja).
 * Si nada calza → NO_ENCONTRADO y la caja ofrece crear el producto.
 */
import {
  CONFIG_BALANZA_POR_DEFECTO,
  decodificarCodigoBalanza,
  esCodigoDeBalanza,
  normalizarCodigoBarras,
  validarCodigoBarras,
  type ConfigBalanza,
} from '@almacen/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { productBarcodes, products } from '../db/schema.js';
import type { RespuestaOff } from './off.js';
import type { Semilla } from './semilla.js';

/** Datos listos para crear el producto en la caja: solo falta precio y stock. */
export interface ProductoSugerido {
  barcode: string;
  name: string;
  brand: string | null;
  format: string | null;
  unit: 'UN';
  categorySlug: string | null;
  imageUrl: string | null;
  /** Código en la semilla (para `products.seed_ref`); `null` si no viene de la semilla. */
  seedRef: string | null;
}

export interface ProductoLocal extends Omit<ProductoSugerido, 'unit' | 'barcode'> {
  id: string;
  barcode: string | null;
  unit: 'UN' | 'KG';
  categoryId: string | null;
  priceClp: number;
  stockQtyMilli: number;
}

/** Lo que trae embebido una etiqueta de balanza. */
export type DatosBalanza =
  | { codigoProducto: string; tipo: 'PESO'; pesoGramos: number }
  | { codigoProducto: string; tipo: 'PRECIO'; precioClp: number };

export type ResultadoLookup =
  | { origen: 'LOCAL'; producto: ProductoLocal; balanza?: DatosBalanza }
  | { origen: 'SEMILLA' | 'OFF'; producto: ProductoSugerido }
  | { origen: 'NO_ENCONTRADO'; producto: null; balanza?: DatosBalanza };

export type ErrorLookup = { error: 'CODIGO_INVALIDO' | 'BALANZA_INVALIDA'; mensaje: string };

export interface DependenciasLookup {
  db: Db;
  semilla: Semilla | null;
  /** Consulta en línea (Open Food Facts); `null` = solo local y semilla. */
  off?: { buscar(barcode: string): Promise<RespuestaOff> } | null;
  configBalanza?: ConfigBalanza;
}

const MENSAJES_BALANZA: Record<string, string> = {
  PREFIJO_NO_CONFIGURADO: 'Ese prefijo de balanza no está configurado en la caja.',
  VALOR_CERO: 'La etiqueta de balanza no trae peso ni precio.',
  CONFIG: 'La configuración de la balanza es inválida.',
};

type FilaProducto = typeof products.$inferSelect;

function aProductoLocal(p: FilaProducto): ProductoLocal {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    format: p.format,
    unit: p.unit,
    categoryId: p.categoryId,
    categorySlug: null,
    imageUrl: null,
    seedRef: p.seedRef,
    priceClp: p.priceClp,
    stockQtyMilli: p.stockQtyMilli,
  };
}

function buscarLocal(db: Db, codigo: string): FilaProducto | null {
  const directo = db
    .select()
    .from(products)
    .where(and(eq(products.barcode, codigo), isNull(products.deletedAt)))
    .get();
  if (directo) return directo;
  const alternativo = db
    .select({ p: products })
    .from(productBarcodes)
    .innerJoin(products, eq(productBarcodes.productId, products.id))
    .where(and(eq(productBarcodes.barcode, codigo), isNull(products.deletedAt)))
    .get();
  return alternativo?.p ?? null;
}

function mensajeInvalido(texto: string): string {
  const r = validarCodigoBarras(texto);
  if (!r.valido && r.motivo === 'DIGITO_VERIFICADOR') {
    return 'El código de barras tiene el dígito verificador malo. Vuelve a escanearlo.';
  }
  return 'El código de barras no es válido: debe tener 8, 12 o 13 dígitos (EAN-8, UPC-A o EAN-13).';
}

export async function buscarProducto(
  deps: DependenciasLookup,
  texto: string,
): Promise<ResultadoLookup | ErrorLookup> {
  const codigo = normalizarCodigoBarras(texto);
  if (codigo === null) return { error: 'CODIGO_INVALIDO', mensaje: mensajeInvalido(texto) };

  if (esCodigoDeBalanza(codigo)) {
    const r = decodificarCodigoBalanza(codigo, deps.configBalanza ?? CONFIG_BALANZA_POR_DEFECTO);
    if (!r.ok) {
      return {
        error: 'BALANZA_INVALIDA',
        mensaje: MENSAJES_BALANZA[r.error] ?? 'La etiqueta de balanza no es válida.',
      };
    }
    const balanza: DatosBalanza =
      r.tipo === 'PESO'
        ? { codigoProducto: r.codigoProducto, tipo: 'PESO', pesoGramos: r.pesoGramos }
        : { codigoProducto: r.codigoProducto, tipo: 'PRECIO', precioClp: r.precioClp };
    // Los códigos de balanza son internos del local: nunca se buscan en la semilla ni en OFF.
    const p = deps.db
      .select()
      .from(products)
      .where(and(eq(products.scaleCode, r.codigoProducto), isNull(products.deletedAt)))
      .get();
    return p
      ? { origen: 'LOCAL', producto: aProductoLocal(p), balanza }
      : { origen: 'NO_ENCONTRADO', producto: null, balanza };
  }

  const local = buscarLocal(deps.db, codigo);
  if (local) return { origen: 'LOCAL', producto: aProductoLocal(local) };

  const fila = deps.semilla?.buscar(codigo);
  if (fila) {
    return {
      origen: 'SEMILLA',
      producto: {
        barcode: fila.barcode,
        name: fila.name,
        brand: fila.brand,
        format: fila.quantity_text,
        unit: 'UN',
        categorySlug: fila.category_slug,
        imageUrl: fila.image_url,
        seedRef: fila.barcode,
      },
    };
  }

  if (deps.off) {
    const r = await deps.off.buscar(codigo);
    if (r.ok) return { origen: 'OFF', producto: r.producto };
  }

  return { origen: 'NO_ENCONTRADO', producto: null };
}
