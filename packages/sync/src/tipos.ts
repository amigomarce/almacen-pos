import type { MedioPago, TipoImpuesto, Unidad } from '@almacen/core';

/**
 * Formato "por el cable" de las entidades que se sincronizan entre la caja y la nube.
 * Reglas:
 * - Solo tipos JSON (las fechas van como ISO 8601, nunca `Date`).
 * - Nombres de campo en camelCase, iguales a los de Drizzle en ambos lados.
 * - El stock NO viaja en `ProductoWire`: se deriva de `MovimientoStockWire` (ARQUITECTURA §2).
 */

export type EntidadSync =
  'products' | 'categories' | 'sales' | 'sale_items' | 'stock_movements' | 'cash_closes';
export type OperacionSync = 'INSERT' | 'UPDATE' | 'DELETE';

export const ENTIDADES_SYNC: readonly EntidadSync[] = [
  'products',
  'categories',
  'sales',
  'sale_items',
  'stock_movements',
  'cash_closes',
];

export interface ProductoWire {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  format: string | null;
  unit: Unidad;
  categoryId: string | null;
  priceClp: number;
  costClp: number | null;
  taxType: TipoImpuesto;
  extraTaxCode: string | null;
  stockMinMilli: number | null;
  active: boolean;
  source: 'SEED' | 'LOCAL';
  seedRef: string | null;
  scaleCode: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

export interface CategoriaWire {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

export interface VentaWire {
  id: string;
  number: number;
  registerId: string;
  /** Snapshot del nombre de la caja (la nube no tiene tabla `registers`). */
  registerName: string | null;
  /** Snapshot del nombre del cajero (la nube no tiene tabla `users`). */
  cashierName: string | null;
  status: 'OK' | 'ANULADA';
  totalClp: number;
  roundingClp: number;
  paymentMethod: MedioPago;
  voidedAt: string | null;
  createdAt: string;
}

export interface LineaVentaWire {
  id: string;
  saleId: string;
  productId: string | null;
  nameSnapshot: string;
  unit: Unidad;
  qtyMilli: number;
  unitPriceClp: number;
  taxType: TipoImpuesto;
  discountClp: number;
  lineTotalClp: number;
}

export interface MovimientoStockWire {
  id: string;
  productId: string;
  qtyMilli: number;
  type: 'VENTA' | 'RECEPCION' | 'AJUSTE' | 'MERMA' | 'ANULACION';
  refId: string | null;
  userId: string | null;
  at: string;
}

/** Cierre de caja que la caja sube para que el dueño lo vea en el móvil. */
export interface CierreCajaWire {
  id: string;
  registerId: string;
  registerName: string | null;
  closedAt: string;
  countedCashClp: number;
  expectedCashClp: number;
  differenceClp: number;
  totalVentasClp: number;
  cantidadVentas: number;
}

/** Un evento de la cola `outbox` (local → nube o nube → local). */
export interface EventoSync {
  entity: EntidadSync;
  entityId: string;
  op: OperacionSync;
  /** La entidad serializada (su forma depende de `entity`). */
  payload: unknown;
}
