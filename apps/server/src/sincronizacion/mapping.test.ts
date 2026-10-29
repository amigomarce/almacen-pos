import { describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { lineaAWire, movimientoAWire, productoAWire, ventaAWire } from './mapping.js';

const FECHA = new Date('2026-10-25T12:00:00.000Z');

describe('mapeo local → wire', () => {
  it('producto: quita el saldo de stock y convierte fechas a ISO', () => {
    const p = {
      id: 'p1',
      barcode: '7800000000009',
      name: 'Bebida',
      brand: null,
      format: null,
      unit: 'UN' as const,
      categoryId: null,
      priceClp: 1290,
      labelPriceClp: 990,
      costClp: null,
      taxType: 'AFECTO' as const,
      extraTaxCode: null,
      stockQtyMilli: 42_000,
      stockMinMilli: null,
      active: true,
      source: 'LOCAL' as const,
      seedRef: null,
      scaleCode: null,
      createdAt: FECHA,
      updatedAt: FECHA,
      version: 1,
      deletedAt: null,
    } satisfies typeof t.products.$inferSelect;
    const w = productoAWire(p);
    expect(w).not.toHaveProperty('stockQtyMilli');
    expect(w).not.toHaveProperty('labelPriceClp');
    expect(w).toMatchObject({ id: 'p1', priceClp: 1290, createdAt: FECHA.toISOString() });
  });

  it('venta: agrega los snapshots de caja y cajero', () => {
    const v = {
      id: 's1',
      number: 1,
      registerId: 'r1',
      cashSessionId: null,
      cashierId: 'u1',
      status: 'OK' as const,
      totalClp: 1290,
      roundingClp: 0,
      paymentMethod: 'EFECTIVO' as const,
      customerId: null,
      paidClp: 2000,
      changeClp: 710,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: FECHA,
    } satisfies typeof t.sales.$inferSelect;
    const w = ventaAWire(v, { registerName: 'Caja 1', cashierName: 'Dueño' });
    expect(w).toMatchObject({
      id: 's1',
      registerName: 'Caja 1',
      cashierName: 'Dueño',
      createdAt: FECHA.toISOString(),
    });
    expect(w).not.toHaveProperty('paidClp');
  });

  it('línea y movimiento se serializan con fechas ISO', () => {
    const l = {
      id: 'si1',
      saleId: 's1',
      productId: 'p1',
      nameSnapshot: 'Bebida',
      unit: 'UN' as const,
      qtyMilli: 1000,
      unitPriceClp: 1290,
      taxType: 'AFECTO' as const,
      discountClp: 0,
      lineTotalClp: 1290,
    } satisfies typeof t.saleItems.$inferSelect;
    expect(lineaAWire(l)).toEqual(l);

    const m = {
      id: 'm1',
      productId: 'p1',
      qtyMilli: -1000,
      type: 'VENTA' as const,
      refId: 's1',
      userId: 'u1',
      at: FECHA,
    } satisfies typeof t.stockMovements.$inferSelect;
    expect(movimientoAWire(m)).toMatchObject({
      id: 'm1',
      qtyMilli: -1000,
      at: FECHA.toISOString(),
    });
  });
});
