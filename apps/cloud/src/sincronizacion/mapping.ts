import type {
  CategoriaWire,
  CierreCajaWire,
  DevolucionWire,
  LineaVentaWire,
  MovimientoStockWire,
  ProductoWire,
  VentaWire,
} from '@almacen/sync';
import type { TipoImpuesto, Unidad } from '@almacen/core';
import type {
  cashCloses,
  categories,
  products,
  saleItems,
  saleReturns,
  sales,
  stockMovements,
} from '../db/schema.js';

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

/** Inverso: de la fila de la nube al wire (para encolar el cambio hacia la caja). */
export function productoAWire(p: typeof products.$inferSelect): ProductoWire {
  const { ownerId: _owner, createdAt, updatedAt, deletedAt, ...resto } = p;
  return {
    ...resto,
    // Las columnas de la nube no tienen el enum en el tipo (solo el CHECK); se acotan aquí.
    unit: p.unit as Unidad,
    taxType: p.taxType as TipoImpuesto,
    source: p.source as ProductoWire['source'],
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    deletedAt: deletedAt?.toISOString() ?? null,
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

export function devolucionDeWire(
  w: DevolucionWire,
  ownerId: string,
): typeof saleReturns.$inferInsert {
  return { ...w, ownerId, createdAt: new Date(w.createdAt) };
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

/** Inverso: la fila de la nube al wire (para encolar una recepción del móvil). */
export function movimientoAWire(m: typeof stockMovements.$inferSelect): MovimientoStockWire {
  const { ownerId: _owner, at, ...resto } = m;
  return { ...resto, type: m.type as MovimientoStockWire['type'], at: at.toISOString() };
}

export function cierreDeWire(w: CierreCajaWire, ownerId: string): typeof cashCloses.$inferInsert {
  const { ...resto } = w;
  return { ...resto, ownerId, closedAt: new Date(w.closedAt) };
}
