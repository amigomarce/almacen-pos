import { describe, expect, it } from 'vitest';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { registers, sales, taxDocuments, users } from '../db/schema.js';
import { estadoColaSii, MINUTOS_ALERTA_SII } from './cola.js';

const AHORA = new Date('2026-10-25T18:00:00-03:00');

function base() {
  const db = abrirDb(':memory:');
  migrar(db);
  const [caja] = db.insert(registers).values({ name: 'Caja 1' }).returning().all();
  const [cajero] = db
    .insert(users)
    .values({ name: 'Cajero', role: 'CAJERO', pinHash: 'x' })
    .returning()
    .all();
  if (!caja || !cajero) throw new Error('base incompleta');
  const [venta] = db
    .insert(sales)
    .values({
      number: 1,
      registerId: caja.id,
      cashierId: cajero.id,
      totalClp: 1000,
      paymentMethod: 'EFECTIVO',
      paidClp: 1000,
    })
    .returning()
    .all();
  if (!venta) throw new Error('venta incompleta');
  return { db, saleId: venta.id };
}

function agregar(
  db: ReturnType<typeof base>['db'],
  saleId: string,
  minutosAtras: number,
  extras: Partial<typeof taxDocuments.$inferInsert> = {},
): void {
  db.insert(taxDocuments)
    .values({
      saleId,
      provider: 'SII_DIRECTO',
      dteType: 39,
      folio: Math.round(minutosAtras) + 1,
      entrega: 'IMPRESA',
      totalClp: 1000,
      netoClp: 840,
      ivaClp: 160,
      exentoClp: 0,
      siiStatus: 'PENDIENTE',
      createdAt: new Date(AHORA.getTime() - minutosAtras * 60_000),
      ...extras,
    })
    .run();
}

describe('estado de la cola del SII', () => {
  it('sin pendientes no hay antigüedad', () => {
    const { db } = base();
    expect(estadoColaSii(db, AHORA)).toEqual({
      pendientes: 0,
      masAntiguaMin: null,
      atrasadas: 0,
    });
  });

  it('cuenta pendientes y marca las que pasaron el plazo de alerta', () => {
    const { db, saleId } = base();
    agregar(db, saleId, 10);
    agregar(db, saleId, MINUTOS_ALERTA_SII);
    agregar(db, saleId, 90);

    expect(estadoColaSii(db, AHORA)).toEqual({
      pendientes: 3,
      masAntiguaMin: 90,
      atrasadas: 2,
    });
  });

  it('ignora las enviadas y las de otros providers', () => {
    const { db, saleId } = base();
    agregar(db, saleId, 10, { siiStatus: 'ENVIADO', folio: 100 });
    agregar(db, saleId, 20, { provider: 'MOCK', dteType: null, folio: null });
    agregar(db, saleId, 30);

    expect(estadoColaSii(db, AHORA)).toMatchObject({ pendientes: 1, atrasadas: 0 });
  });

  it('no muestra antigüedad negativa si el reloj va atrás', () => {
    const { db, saleId } = base();
    agregar(db, saleId, -5);
    expect(estadoColaSii(db, AHORA).masAntiguaMin).toBe(0);
  });
});
