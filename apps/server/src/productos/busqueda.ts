import { and, asc, eq, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { products } from '../db/schema.js';

export interface ProductoBuscado {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  format: string | null;
  unit: 'UN' | 'KG';
  priceClp: number;
  stockQtyMilli: number;
  taxType: 'AFECTO' | 'EXENTO';
}

/** Para la pantalla de productos: además del precio, costo, stock mínimo y si está activo. */
export interface ProductoListado extends ProductoBuscado {
  costClp: number | null;
  stockMinMilli: number | null;
  active: boolean;
  categoryId: string | null;
}

/**
 * - `STOCK_BAJO`: en o bajo el stock mínimo, o sin stock.
 * - `SIN_STOCK`: stock en 0 o negativo.
 * - `SIN_CATEGORIA`: dados de alta sin categoría (para completar).
 * - `INACTIVOS`: desactivados (no se venden).
 */
export type FiltroProductos = 'STOCK_BAJO' | 'SIN_STOCK' | 'SIN_CATEGORIA' | 'INACTIVOS';
export const FILTROS_PRODUCTOS: readonly FiltroProductos[] = [
  'STOCK_BAJO',
  'SIN_STOCK',
  'SIN_CATEGORIA',
  'INACTIVOS',
];

/** Escapa los comodines de LIKE para buscar el texto tal cual. */
const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

function condicionFiltro(filtro: FiltroProductos | undefined): SQL | undefined {
  switch (filtro) {
    case 'STOCK_BAJO':
      return or(
        lte(products.stockQtyMilli, 0),
        sql`${products.stockQtyMilli} <= ${products.stockMinMilli}`,
      );
    case 'SIN_STOCK':
      return lte(products.stockQtyMilli, 0);
    case 'SIN_CATEGORIA':
      return isNull(products.categoryId);
    case 'INACTIVOS':
    case undefined:
      return undefined;
  }
}

/**
 * Busca productos del local por nombre, marca o código (F2 en la caja y pantalla de productos).
 * Todas las palabras deben aparecer: "leche entera" encuentra "Leche entera 1 L". Sin texto,
 * solo devuelve algo si hay un filtro.
 */
export function buscarProductos(
  db: Db,
  texto: string,
  limite = 20,
  filtro?: FiltroProductos,
): ProductoListado[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (palabras.length === 0 && !filtro) return [];
  const condiciones = palabras.map((p) => {
    const patron = `%${escaparLike(p)}%`;
    return or(
      sql`${products.name} like ${patron} escape '\\'`,
      sql`coalesce(${products.brand}, '') like ${patron} escape '\\'`,
      like(products.barcode, `${escaparLike(p)}%`),
    );
  });
  return db
    .select({
      id: products.id,
      barcode: products.barcode,
      name: products.name,
      brand: products.brand,
      format: products.format,
      unit: products.unit,
      priceClp: products.priceClp,
      stockQtyMilli: products.stockQtyMilli,
      taxType: products.taxType,
      costClp: products.costClp,
      stockMinMilli: products.stockMinMilli,
      active: products.active,
      categoryId: products.categoryId,
    })
    .from(products)
    .where(
      and(
        eq(products.active, filtro !== 'INACTIVOS'),
        isNull(products.deletedAt),
        condicionFiltro(filtro),
        ...condiciones,
      ),
    )
    .orderBy(asc(products.name))
    .limit(Math.max(1, Math.min(limite, 200)))
    .all();
}
