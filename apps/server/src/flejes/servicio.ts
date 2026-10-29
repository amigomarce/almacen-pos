/**
 * Flejes de precio pendientes: cuando cambia el precio de un producto (en la caja, en masa o
 * desde el celular), su etiqueta de la góndola queda desactualizada. `label_price_clp` guarda
 * el precio impreso; si no coincide con el precio vigente, el fleje está pendiente.
 */
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { products } from '../db/schema.js';

export interface FlejePendiente {
  id: string;
  nombre: string;
  marca: string | null;
  formato: string | null;
  unidad: 'UN' | 'KG';
  codigo: string | null;
  precioClp: number;
  /** Lo que dice la etiqueta hoy (`null` si nunca se imprimió). */
  precioEtiquetaClp: number | null;
}

const pendiente = or(isNull(products.labelPriceClp), ne(products.labelPriceClp, products.priceClp));

/** Productos activos cuyo fleje no muestra el precio vigente, por nombre. */
export function flejesPendientes(db: Db): FlejePendiente[] {
  return db
    .select({
      id: products.id,
      nombre: products.name,
      marca: products.brand,
      formato: products.format,
      unidad: products.unit,
      codigo: products.barcode,
      precioClp: products.priceClp,
      precioEtiquetaClp: products.labelPriceClp,
    })
    .from(products)
    .where(and(eq(products.active, true), isNull(products.deletedAt), pendiente))
    .orderBy(products.name)
    .all();
}

/** Los flejes de estos productos ya muestran el precio vigente (impresos o cambiados a mano). */
export function marcarFlejesAlDia(db: Db, ids: readonly string[]): number {
  if (ids.length === 0) return 0;
  return db
    .update(products)
    .set({ labelPriceClp: sql`${products.priceClp}` })
    .where(inArray(products.id, [...ids]))
    .run().changes;
}
