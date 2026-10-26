import { calcularTotalesDocumento } from '@almacen/core';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { BoletaParaGuardarSii } from '@almacen/dte';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { cafRanges, cashSessions, registers, sales, taxDocuments, users } from '../db/schema.js';
import { CLAVE_SII, baseSii } from '../test/sii.js';
import { crearRepositorioSii } from './repositorio.js';

const AHORA = new Date('2026-10-25T18:00:00-03:00');

function ventaDb() {
  const { db } = baseSii();
  const [caja] = db.insert(registers).values({ name: 'Caja 1' }).returning().all();
  const [cajero] = db
    .insert(users)
    .values({ name: 'Cajero', role: 'CAJERO', pinHash: 'x' })
    .returning()
    .all();
  if (!caja || !cajero) throw new Error('base de venta incompleta');
  const [sesion] = db
    .insert(cashSessions)
    .values({ registerId: caja.id, openedBy: cajero.id, openingCash: 0 })
    .returning()
    .all();
  const [venta] = db
    .insert(sales)
    .values({
      number: 1,
      registerId: caja.id,
      cashSessionId: sesion?.id ?? null,
      cashierId: cajero.id,
      totalClp: 1190,
      paymentMethod: 'EFECTIVO',
      paidClp: 1190,
    })
    .returning()
    .all();
  if (!venta) throw new Error('venta de prueba incompleta');
  return { db, venta };
}

function boleta(
  ventaId: string,
  extras: Partial<BoletaParaGuardarSii['documento']> = {},
): BoletaParaGuardarSii {
  const tipoDte = extras.tipoDte ?? 39;
  const folio = extras.folio ?? 1;
  const lineas = [
    {
      nombre: 'Bebida',
      unidad: 'UN' as const,
      cantidadMilli: 1000,
      precioUnitarioClp: 1190,
      montoClp: 1190,
      tipoImpuesto: 'AFECTO' as const,
    },
  ];
  return {
    venta: {
      ventaId,
      numeroVenta: 1,
      fecha: AHORA,
      medioPago: 'EFECTIVO',
      entrega: 'IMPRESA',
      lineas,
      totales: calcularTotalesDocumento(
        lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.montoClp })),
      ),
    },
    documento: {
      tipoDte,
      folio,
      xml: `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte"><Documento ID="T${tipoDte}F${folio}"></Documento></DTE>`,
      ted: '<TED/>',
      ...extras,
    },
  };
}

describe('repositorio SII: folios', () => {
  it('reserva folios correlativos y los persiste entre instancias', async () => {
    const { db } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });

    const uno = await repo.reservarFolio(39);
    const otro = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    const dos = await otro.reservarFolio(39);

    expect([uno.folio, dos.folio]).toEqual([1, 2]);
    expect(db.select().from(cafRanges).where(eq(cafRanges.dteType, 39)).get()?.nextFolio).toBe(3);
  });

  it('usa el CAF de cada tipo por separado', async () => {
    const { db } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    expect((await repo.reservarFolio(41)).folio).toBe(500);
  });

  it('falla si no hay CAF', async () => {
    const db = abrirDb(':memory:');
    migrar(db);
    const repo = crearRepositorioSii(db, CLAVE_SII);
    await expect(repo.reservarFolio(39)).rejects.toMatchObject({ codigo: 'CAF_AGOTADO' });
  });

  it('falla si todos los CAF están vencidos o agotados', async () => {
    const { db } = ventaDb();
    db.update(cafRanges)
      .set({ expiresAt: new Date('2020-01-01') })
      .run();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    await expect(repo.reservarFolio(39)).rejects.toMatchObject({ codigo: 'CAF_AGOTADO' });

    db.update(cafRanges)
      .set({ expiresAt: null, nextFolio: 101 })
      .where(eq(cafRanges.dteType, 39))
      .run();
    await expect(repo.reservarFolio(39)).rejects.toMatchObject({ codigo: 'CAF_AGOTADO' });
  });

  it('falla si el CAF guardado no se puede descifrar', async () => {
    const { db } = ventaDb();
    db.update(cafRanges).set({ xmlEncrypted: 'v1:aaaa:bbbb:cccc' }).run();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    await expect(repo.reservarFolio(39)).rejects.toMatchObject({
      codigo: 'SECRETO_SII_INVALIDO',
    });
  });
});

describe('repositorio SII: cola de envío', () => {
  it('guarda el DTE pendiente con sus montos y XML', async () => {
    const { db, venta } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });

    await repo.guardarPendiente(boleta(venta.id));

    const fila = db.select().from(taxDocuments).get();
    expect(fila).toMatchObject({
      saleId: venta.id,
      provider: 'SII_DIRECTO',
      dteType: 39,
      folio: 1,
      totalClp: 1190,
      netoClp: 1000,
      ivaClp: 190,
      exentoClp: 0,
      siiStatus: 'PENDIENTE',
      attempts: 0,
      trackId: null,
    });
    expect(fila?.xml).toContain('<DTE');
    expect(fila?.ted).toBe('<TED/>');
  });

  it('lista solo los pendientes de SII_DIRECTO, en orden de emisión', async () => {
    const { db, venta } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    await repo.guardarPendiente(boleta(venta.id, { folio: 1 }));
    await repo.guardarPendiente(boleta(venta.id, { folio: 2 }));
    db.insert(taxDocuments)
      .values({
        saleId: venta.id,
        provider: 'MOCK',
        entrega: 'IMPRESA',
        totalClp: 1190,
        netoClp: 1000,
        ivaClp: 190,
        exentoClp: 0,
        siiStatus: 'NO_APLICA',
      })
      .run();

    const pendientes = await repo.pendientes();
    expect(pendientes.map((p) => p.folio)).toEqual([1, 2]);
    expect(pendientes[0]?.intentos).toBe(0);
    expect(pendientes[0]?.ultimoIntento).toBeNull();
  });

  it('registra error, intentos y último intento', async () => {
    const { db, venta } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    await repo.guardarPendiente(boleta(venta.id));

    const [p] = await repo.pendientes();
    if (!p) throw new Error('sin pendiente');
    await repo.marcarError(p.id, { error: 'x'.repeat(800), ahora: AHORA });

    const fila = db.select().from(taxDocuments).get();
    expect(fila?.attempts).toBe(1);
    expect(fila?.lastAttemptAt?.getTime()).toBe(AHORA.getTime());
    expect(fila?.lastError).toHaveLength(500);
    expect(fila?.siiStatus).toBe('PENDIENTE');
  });

  it('marca enviada con track id y luego actualiza el estado definitivo', async () => {
    const { db, venta } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII, { ahora: () => AHORA });
    await repo.guardarPendiente(boleta(venta.id));

    const [p] = await repo.pendientes();
    if (!p) throw new Error('sin pendiente');
    await repo.marcarEnviada(p.id, { trackId: '1014', estado: 'ENVIADO', ahora: AHORA });

    expect(db.select().from(taxDocuments).get()).toMatchObject({
      siiStatus: 'ENVIADO',
      trackId: '1014',
    });
    expect(await repo.pendientes()).toEqual([]);

    await repo.actualizarEstado('1014', 'ACEPTADO');
    expect(db.select().from(taxDocuments).get()?.siiStatus).toBe('ACEPTADO');
  });

  it('actualizar un track inexistente no falla', async () => {
    const { db } = ventaDb();
    const repo = crearRepositorioSii(db, CLAVE_SII);
    await expect(repo.actualizarEstado('999', 'RECHAZADO')).resolves.toBeUndefined();
  });
});
