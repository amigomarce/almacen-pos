import { describe, expect, it } from 'vitest';
import { ingestarEventos } from './servicio.js';
import { repoSyncFalso } from '../test/ayudas.js';

const ISO = '2026-10-25T12:00:00.000Z';

const producto = (id: string) => ({
  id,
  barcode: null,
  name: 'Pan',
  brand: null,
  format: null,
  unit: 'KG' as const,
  categoryId: null,
  priceClp: 1990,
  costClp: null,
  taxType: 'AFECTO' as const,
  extraTaxCode: null,
  stockMinMilli: null,
  active: true,
  source: 'LOCAL' as const,
  seedRef: null,
  scaleCode: null,
  createdAt: ISO,
  updatedAt: ISO,
  version: 1,
  deletedAt: null,
});

describe('ingestarEventos', () => {
  it('ingesta producto, venta, línea y movimiento', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      { entity: 'products', op: 'INSERT', entityId: 'p1', payload: producto('p1') },
      {
        entity: 'sales',
        op: 'INSERT',
        entityId: 's1',
        payload: {
          id: 's1',
          number: 1,
          registerId: 'r1',
          registerName: 'Caja 1',
          cashierName: 'Dueño',
          status: 'OK',
          totalClp: 1990,
          roundingClp: 0,
          paymentMethod: 'EFECTIVO',
          voidedAt: null,
          createdAt: ISO,
        },
      },
      {
        entity: 'sale_items',
        op: 'INSERT',
        entityId: 'si1',
        payload: {
          id: 'si1',
          saleId: 's1',
          productId: 'p1',
          nameSnapshot: 'Pan',
          unit: 'KG',
          qtyMilli: 500,
          unitPriceClp: 3980,
          taxType: 'AFECTO',
          discountClp: 0,
          lineTotalClp: 1990,
        },
      },
      {
        entity: 'stock_movements',
        op: 'INSERT',
        entityId: 'm1',
        payload: {
          id: 'm1',
          productId: 'p1',
          qtyMilli: -500,
          type: 'VENTA',
          refId: 's1',
          userId: null,
          at: ISO,
        },
      },
    ]);
    expect(repo.productos).toHaveLength(1);
    expect(repo.productos[0]).toMatchObject({ id: 'p1', ownerId: 'dueno-1' });
    expect(repo.ventas).toHaveLength(1);
    expect(repo.ventas[0]).toMatchObject({ id: 's1', registerName: 'Caja 1' });
    expect(repo.lineas).toHaveLength(1);
    expect(repo.movimientos).toHaveLength(1);
  });

  it('DELETE de producto y categoría borra suave', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      { entity: 'products', op: 'DELETE', entityId: 'p1', payload: {} },
      { entity: 'categories', op: 'DELETE', entityId: 'c1', payload: {} },
    ]);
    expect(repo.borradosProducto).toEqual(['p1']);
    expect(repo.borradosCategoria).toEqual(['c1']);
  });

  it('ignora UPDATE/DELETE de líneas y movimientos (append-only)', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      { entity: 'sale_items', op: 'DELETE', entityId: 'si1', payload: {} },
      { entity: 'stock_movements', op: 'UPDATE', entityId: 'm1', payload: {} },
    ]);
    expect(repo.lineas).toHaveLength(0);
    expect(repo.movimientos).toHaveLength(0);
  });

  it('UPDATE de venta refleja la anulación', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      {
        entity: 'sales',
        op: 'UPDATE',
        entityId: 's1',
        payload: {
          id: 's1',
          number: 1,
          registerId: 'r1',
          registerName: 'Caja 1',
          cashierName: 'Dueño',
          status: 'ANULADA',
          totalClp: 1990,
          roundingClp: 0,
          paymentMethod: 'EFECTIVO',
          voidedAt: ISO,
          createdAt: ISO,
        },
      },
    ]);
    expect(repo.ventasActualizadas).toHaveLength(1);
    expect(repo.ventasActualizadas[0]).toMatchObject({ id: 's1', status: 'ANULADA' });
  });

  it('ingesta un cierre de caja', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      {
        entity: 'cash_closes',
        op: 'INSERT',
        entityId: 'c1',
        payload: {
          id: 'c1',
          registerId: 'r1',
          registerName: 'Caja 1',
          closedAt: ISO,
          countedCashClp: 10000,
          expectedCashClp: 9800,
          differenceClp: 200,
          totalVentasClp: 50000,
          cantidadVentas: 12,
        },
      },
    ]);
    expect(repo.cierres).toHaveLength(1);
    expect(repo.cierres[0]).toMatchObject({ id: 'c1', registerId: 'r1', differenceClp: 200 });
  });
  it('ingesta una devolución parcial con sus ítems', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      {
        entity: 'sale_returns',
        op: 'INSERT',
        entityId: 'd1',
        payload: {
          id: 'd1',
          saleId: 's1',
          registerId: 'r1',
          refundClp: 1890,
          roundingClp: 0,
          paymentMethod: 'EFECTIVO',
          reason: 'Abollada',
          createdAt: ISO,
          items: [
            {
              saleItemId: 'i1',
              productId: 'p1',
              nameSnapshot: 'Bebida',
              qtyMilli: 1000,
              amountClp: 1890,
            },
          ],
        },
      },
    ]);
    expect(repo.devoluciones).toHaveLength(1);
    expect(repo.devoluciones[0]).toMatchObject({
      id: 'd1',
      ownerId: 'dueno-1',
      refundClp: 1890,
      createdAt: new Date(ISO),
    });
  });

  it('UPDATE de producto actualiza (upsert)', async () => {
    const repo = repoSyncFalso();
    await ingestarEventos(repo, 'dueno-1', [
      { entity: 'products', op: 'UPDATE', entityId: 'p1', payload: producto('p1') },
    ]);
    expect(repo.productos).toHaveLength(1);
    expect(repo.borradosProducto).toHaveLength(0);
  });
});
