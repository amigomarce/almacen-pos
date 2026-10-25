import { and, asc, eq, isNull, like, or, sql } from 'drizzle-orm';
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

/** Escapa los comodines de LIKE para buscar el texto tal cual. */
const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Busca productos activos del local por nombre, marca o código (F2 en la caja). Todas las
 * palabras deben aparecer: "leche entera" encuentra "Leche entera 1 L".
 */
export function buscarProductos(db: Db, texto: string, limite = 20): ProductoBuscado[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (palabras.length === 0) return [];
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
    })
    .from(products)
    .where(and(eq(products.active, true), isNull(products.deletedAt), ...condiciones))
    .orderBy(asc(products.name))
    .limit(Math.max(1, Math.min(limite, 50)))
    .all();
}
