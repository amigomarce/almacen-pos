import type {
  CategoriaWire,
  LineaVentaWire,
  MovimientoStockWire,
  ProductoWire,
  VentaWire,
} from '@almacen/sync';
import type { categories, products, saleItems, sales, stockMovements } from '../db/schema.js';

/**
 * Convierte el wire format (JSON, fechas ISO) a las filas de la nube. Agrega `owner_id` y
 * devuelve `Date`; el resto de campos va tal cual (mismos nombres camelCase en ambos lados).
 * El stock no viaja en el producto: se reconstruye desde los movimientos.
 */

function fecha(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function productoDeWire(w: ProductoWire, ownerId: string): typeof products.$inferInsert {
  return {
    ...w,
    ownerId,
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
    deletedAt: fecha(w.deletedAt),
  };
}

export function categoriaDeWire(w: CategoriaWire, ownerId: string): typeof categories.$inferInsert {
  return {
    ...w,
    ownerId,
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
    deletedAt: fecha(w.deletedAt),
  };
}

export function ventaDeWire(w: VentaWire, ownerId: string): typeof sales.$inferInsert {
  return {
    ...w,
    ownerId,
    voidedAt: fecha(w.voidedAt),
    createdAt: new Date(w.createdAt),
  };
}

export function lineaDeWire(w: LineaVentaWire): typeof saleItems.$inferInsert {
  return { ...w };
}

export function movimientoDeWire(
  w: MovimientoStockWire,
  ownerId: string,
): typeof stockMovements.$inferInsert {
  return { ...w, ownerId, at: new Date(w.at) };
}
