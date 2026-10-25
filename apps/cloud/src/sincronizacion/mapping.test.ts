import type { ProductoWire, VentaWire } from '@almacen/sync';
import { describe, expect, it } from 'vitest';
import {
  categoriaDeWire,
  lineaDeWire,
  movimientoDeWire,
  productoDeWire,
  ventaDeWire,
} from './mapping.js';

const ISO = '2026-10-25T12:00:00.000Z';

describe('mapeo wire → nube', () => {
  it('producto: agrega owner_id, convierte fechas y no lleva stock', () => {
    const w: ProductoWire = {
      id: 'p1',
      barcode: '7800000000009',
      name: 'Bebida',
      brand: null,
      format: null,
      unit: 'UN',
      categoryId: null,
      priceClp: 1290,
      costClp: null,
      taxType: 'AFECTO',
      extraTaxCode: null,
      stockMinMilli: null,
      active: true,
      source: 'LOCAL',
      seedRef: null,
      scaleCode: null,
      createdAt: ISO,
      updatedAt: ISO,
      version: 1,
      deletedAt: null,
    };
    const p = productoDeWire(w, 'dueno-1');
    expect(p).toMatchObject({ id: 'p1', ownerId: 'dueno-1', priceClp: 1290 });
    expect(p.createdAt).toBeInstanceOf(Date);
    expect(p.deletedAt).toBeNull();
    expect('stockQtyMilli' in p).toBe(false);
  });

  it('producto: convierte deletedAt cuando existe', () => {
    const w: ProductoWire = {
      id: 'p1',
      barcode: null,
      name: 'X',
      brand: null,
      format: null,
      unit: 'UN',
      categoryId: null,
      priceClp: 1,
      costClp: null,
      taxType: 'AFECTO',
      extraTaxCode: null,
      stockMinMilli: null,
      active: true,
      source: 'LOCAL',
      seedRef: null,
      scaleCode: null,
      createdAt: ISO,
      updatedAt: ISO,
      version: 2,
      deletedAt: ISO,
    };
    expect(productoDeWire(w, 'u').deletedAt).toBeInstanceOf(Date);
  });

  it('categoría: agrega owner_id y convierte fechas', () => {
    const c = categoriaDeWire(
      {
        id: 'c1',
        name: 'Bebidas',
        parentId: null,
        createdAt: ISO,
        updatedAt: ISO,
        version: 1,
        deletedAt: null,
      },
      'dueno-1',
    );
    expect(c).toMatchObject({ id: 'c1', ownerId: 'dueno-1', name: 'Bebidas' });
    expect(c.createdAt).toBeInstanceOf(Date);
  });

  it('venta: convierte created_at y agrega owner_id', () => {
    const w: VentaWire = {
      id: 's1',
      number: 1,
      registerId: 'r1',
      registerName: 'Caja 1',
      cashierName: 'Dueño',
      status: 'OK',
      totalClp: 1290,
      roundingClp: 0,
      paymentMethod: 'EFECTIVO',
      voidedAt: null,
      createdAt: ISO,
    };
    const v = ventaDeWire(w, 'dueno-1');
    expect(v).toMatchObject({ id: 's1', ownerId: 'dueno-1', registerName: 'Caja 1' });
    expect(v.createdAt).toBeInstanceOf(Date);
  });

  it('movimiento: convierte at', () => {
    const m = movimientoDeWire(
      {
        id: 'm1',
        productId: 'p1',
        qtyMilli: -1250,
        type: 'VENTA',
        refId: null,
        userId: null,
        at: ISO,
      },
      'dueno-1',
    );
    expect(m).toMatchObject({ id: 'm1', ownerId: 'dueno-1', qtyMilli: -1250 });
    expect(m.at).toBeInstanceOf(Date);
  });

  it('línea: pasa tal cual (sin fechas ni owner)', () => {
    const l = {
      id: 'si1',
      saleId: 's1',
      productId: 'p1',
      nameSnapshot: 'Bebida',
      unit: 'UN',
      qtyMilli: 1000,
      unitPriceClp: 1290,
      taxType: 'AFECTO',
      discountClp: 0,
      lineTotalClp: 1290,
    } as const;
    expect(lineaDeWire(l)).toEqual(l);
  });
});
