import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esCodigoDeBalanza, MILI, normalizarCodigoBarras } from '@almacen/core';
import { cargarTaxonomia, DIR_DATA, type Categoria } from '@almacen/data';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  categories,
  priceHistory,
  productBarcodes,
  products,
  stockMovements,
} from '../db/schema.js';
import { ErrorHttp } from '../errores.js';

export type Taxonomia = Map<string, Categoria>;

/** `data/categorias.csv`: las mismas categorías que usa la semilla. */
export function cargarTaxonomiaPorDefecto(): Taxonomia {
  return cargarTaxonomia(readFileSync(join(DIR_DATA, 'categorias.csv'), 'utf8'));
}

export interface DatosAlta {
  barcode?: string | null;
  name: string;
  brand?: string | null;
  format?: string | null;
  unit: 'UN' | 'KG';
  priceClp: number;
  /** Stock que hay ahora en la sala (opcional). */
  stockInicialMilli?: number;
  /** Categoría de la semilla (`data/categorias.csv`). */
  categorySlug?: string | null;
  /** Código en la semilla, si viene de ahí. */
  seedRef?: string | null;
  taxType?: 'AFECTO' | 'EXENTO';
}

export interface ProductoCreado {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  format: string | null;
  unit: 'UN' | 'KG';
  priceClp: number;
  stockQtyMilli: number;
  categoryId: string | null;
}

const texto = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * Busca la categoría local con ese nombre (bajo el mismo padre) o la crea, junto con sus padres.
 * Así las categorías de la semilla aparecen en el local a medida que se usan.
 */
export function resolverCategoria(db: Db, slug: string, taxonomia: Taxonomia): string | null {
  const cat = taxonomia.get(slug);
  if (!cat) return null;
  const padreId = cat.padre ? resolverCategoria(db, cat.padre, taxonomia) : null;
  const existente = db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.name, cat.nombre),
        padreId ? eq(categories.parentId, padreId) : isNull(categories.parentId),
        isNull(categories.deletedAt),
      ),
    )
    .get();
  if (existente) return existente.id;
  return db.insert(categories).values({ name: cat.nombre, parentId: padreId }).returning().get().id;
}

/**
 * Alta rápida desde la caja: datos de la semilla (o escritos) + precio y stock. Deja el precio
 * inicial en el historial (precio anterior 0) y el stock inicial como ajuste.
 */
export function crearProducto(
  db: Db,
  datos: DatosAlta,
  usuarioId: string,
  taxonomia: Taxonomia,
): ProductoCreado {
  let barcode: string | null = null;
  if (texto(datos.barcode)) {
    barcode = normalizarCodigoBarras(datos.barcode ?? '');
    if (!barcode) throw new ErrorHttp('CODIGO_INVALIDO', 'El código de barras no es válido', 400);
    if (esCodigoDeBalanza(barcode)) {
      throw new ErrorHttp(
        'CODIGO_BALANZA',
        'Un código de balanza no se registra como producto nuevo',
        400,
      );
    }
  }
  const stock = datos.stockInicialMilli ?? 0;
  if (datos.unit === 'UN' && stock % MILI !== 0) {
    throw new ErrorHttp(
      'STOCK_FRACCIONARIO',
      'Un producto por unidad no admite stock con decimales',
      400,
    );
  }
  const nombre = texto(datos.name);
  if (!nombre) throw new ErrorHttp('NOMBRE_VACIO', 'Falta el nombre del producto', 400);

  return db.transaction(() => {
    if (barcode) {
      const repetido =
        db.select({ id: products.id }).from(products).where(eq(products.barcode, barcode)).get() ??
        db
          .select({ id: productBarcodes.productId })
          .from(productBarcodes)
          .where(eq(productBarcodes.barcode, barcode))
          .get();
      if (repetido) {
        throw new ErrorHttp(
          'CODIGO_EXISTE',
          'Ese código ya está registrado en otro producto',
          409,
          {
            productoId: repetido.id,
          },
        );
      }
    }
    const categoryId = datos.categorySlug
      ? resolverCategoria(db, datos.categorySlug, taxonomia)
      : null;
    const p = db
      .insert(products)
      .values({
        barcode,
        name: nombre,
        brand: texto(datos.brand),
        format: texto(datos.format),
        unit: datos.unit,
        categoryId,
        priceClp: datos.priceClp,
        taxType: datos.taxType ?? 'AFECTO',
        stockQtyMilli: stock,
        source: datos.seedRef ? 'SEED' : 'LOCAL',
        seedRef: texto(datos.seedRef),
      })
      .returning()
      .get();
    db.insert(priceHistory)
      .values({
        productId: p.id,
        oldPrice: 0,
        newPrice: p.priceClp,
        changedBy: usuarioId,
        device: 'caja',
      })
      .run();
    if (stock > 0) {
      db.insert(stockMovements)
        .values({
          productId: p.id,
          qtyMilli: stock,
          type: 'AJUSTE',
          refId: p.id,
          userId: usuarioId,
        })
        .run();
    }
    return {
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      brand: p.brand,
      format: p.format,
      unit: p.unit,
      priceClp: p.priceClp,
      stockQtyMilli: p.stockQtyMilli,
      categoryId: p.categoryId,
    };
  });
}
