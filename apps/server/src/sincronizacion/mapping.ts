import type {
  CategoriaWire,
  LineaVentaWire,
  MovimientoStockWire,
  ProductoWire,
  VentaWire,
} from '@almacen/sync';
import type { MedioPago } from '@almacen/core';
import type { categories, products, saleItems, sales, stockMovements } from '../db/schema.js';

/**
 * Convierte las entidades locales al wire format (JSON, fechas ISO). El saldo de stock no viaja
 * en el producto (se reconstruye en la nube desde los movimientos, ARQUITECTURA §2).
 */

export function productoAWire(p: typeof products.$inferSelect): ProductoWire {
  // El precio del fleje es solo local (qué etiqueta hay en la góndola de este almacén).
  const {
    stockQtyMilli: _stock,
    labelPriceClp: _fleje,
    createdAt,
    updatedAt,
    deletedAt,
    ...resto
  } = p;
  return {
    ...resto,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    deletedAt: deletedAt?.toISOString() ?? null,
  };
}

export function categoriaAWire(c: typeof categories.$inferSelect): CategoriaWire {
  return {
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    version: c.version,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  };
}

export function ventaAWire(
  v: typeof sales.$inferSelect,
  nombres: { registerName: string | null; cashierName: string | null },
): VentaWire {
  return {
    id: v.id,
    number: v.number,
    registerId: v.registerId,
    registerName: nombres.registerName,
    cashierName: nombres.cashierName,
    status: v.status,
    totalClp: v.totalClp,
    roundingClp: v.roundingClp,
    paymentMethod: v.paymentMethod as MedioPago,
    voidedAt: v.voidedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export function lineaAWire(l: typeof saleItems.$inferSelect): LineaVentaWire {
  return { ...l };
}

export function movimientoAWire(m: typeof stockMovements.$inferSelect): MovimientoStockWire {
  return { ...m, at: m.at.toISOString() };
}
