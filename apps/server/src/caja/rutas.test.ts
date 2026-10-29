import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';
import { registrarCierreInesperado } from './servicio.js';

let c: CtxPrueba;
let headers: { authorization: string };

beforeEach(async () => {
  c = prepararApp();
  headers = await entrarComo(c, c.cajeroId, '0000');
});

const abrir = (efectivoInicialClp: unknown, extra: object = {}) =>
  c.app.inject({
    method: 'POST',
    url: '/cash/open',
    headers,
    payload: { efectivoInicialClp, ...extra },
  });
const cerrar = (efectivoContadoClp: unknown) =>
  c.app.inject({ method: 'POST', url: '/cash/close', headers, payload: { efectivoContadoClp } });
const actual = () => c.app.inject({ method: 'GET', url: '/cash/current', headers });

/** Inserta una venta directo en la base (las ventas por API llegan en el paso siguiente). */
function venta(
  sesionId: string,
  numero: number,
  v: {
    medio: 'EFECTIVO' | 'DEBITO' | 'TRANSFERENCIA';
    total: number;
    redondeo?: number;
    anulada?: boolean;
  },
) {
  const registerId = c.db.select().from(t.registers).get()?.id ?? '';
  c.db
    .insert(t.sales)
    .values({
      number: numero,
      registerId,
      cashSessionId: sesionId,
      cashierId: c.cajeroId,
      status: v.anulada ? 'ANULADA' : 'OK',
      totalClp: v.total,
      roundingClp: v.redondeo ?? 0,
      paymentMethod: v.medio,
      paidClp: v.total + (v.redondeo ?? 0),
    })
    .run();
}

describe('caja', () => {
  it('empieza cerrada', async () => {
    const res = await actual();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ caja: { name: 'Caja 1' }, sesion: null, resumen: null });
  });

  it('/health informa si hay caja abierta (la app de escritorio no se cierra mientras tanto)', async () => {
    const salud = async () =>
      (await c.app.inject({ method: 'GET', url: '/health' })).json<{ cajaAbierta: boolean }>();
    expect((await salud()).cajaAbierta).toBe(false);
    expect((await abrir(10000)).statusCode).toBe(201);
    expect((await salud()).cajaAbierta).toBe(true);
    expect((await cerrar(10000)).statusCode).toBe(200);
    expect((await salud()).cajaAbierta).toBe(false);
  });

  it('anota los cierres inesperados de la app en el turno abierto (para el dueño)', async () => {
    // Sin turno abierto no hay nada que anotar.
    expect(registrarCierreInesperado(c.db)).toBe(0);
    expect(c.db.select().from(t.unexpectedShutdowns).all()).toHaveLength(0);

    expect((await abrir(5000)).statusCode).toBe(201);
    expect((await actual()).json()).toMatchObject({
      sesion: { cierresInesperados: { cantidad: 0, ultimo: null } },
    });
    expect(registrarCierreInesperado(c.db, new Date('2026-10-29T13:00:00Z'))).toBe(1);
    expect(registrarCierreInesperado(c.db, new Date('2026-10-29T15:30:00Z'))).toBe(1);
    expect((await actual()).json()).toMatchObject({
      sesion: { cierresInesperados: { cantidad: 2, ultimo: '2026-10-29T15:30:00.000Z' } },
    });

    // Al cerrar el turno el registro se conserva (nada se borra).
    const cierre = await cerrar(5000);
    expect(cierre.json()).toMatchObject({
      sesion: { cierresInesperados: { cantidad: 2 } },
    });
    expect(c.db.select().from(t.unexpectedShutdowns).all()).toHaveLength(2);
  });

  it('retiros e ingresos de efectivo: quedan a nombre de quien los hizo y ajustan el esperado', async () => {
    const mover = (payload: object) =>
      c.app.inject({ method: 'POST', url: '/cash/movements', headers, payload });

    // Con la caja cerrada no se puede.
    const cerrada = await mover({ tipo: 'RETIRO', montoClp: 1000, motivo: 'Pan' });
    expect(cerrada.statusCode).toBe(409);
    expect(cerrada.json()).toMatchObject({ error: 'CAJA_CERRADA' });

    expect((await abrir(20000)).statusCode).toBe(201);
    const retiro = await mover({ tipo: 'RETIRO', montoClp: 8000, motivo: '  Pan Ideal  ' });
    expect(retiro.statusCode).toBe(201);
    expect(retiro.json()).toMatchObject({
      movimiento: {
        tipo: 'RETIRO',
        montoClp: 8000,
        motivo: 'Pan Ideal',
        usuario: { id: c.cajeroId, name: 'Cajero' },
      },
      resumen: {
        movimientos: { retirosClp: 8000, ingresosClp: 0, cantidad: 1 },
        efectivoEsperadoClp: 12000,
      },
    });
    expect((await mover({ tipo: 'INGRESO', montoClp: 5000, motivo: 'Sencillo' })).statusCode).toBe(
      201,
    );

    const estado = (await actual()).json<{
      resumen: { efectivoEsperadoClp: number };
      movimientos: { motivo: string }[];
    }>();
    expect(estado.resumen.efectivoEsperadoClp).toBe(17000);
    expect(estado.movimientos.map((m) => m.motivo)).toEqual(['Pan Ideal', 'Sencillo']);

    // Validaciones: monto positivo, motivo con texto y tipo conocido.
    expect((await mover({ tipo: 'RETIRO', montoClp: 0, motivo: 'x' })).statusCode).toBe(400);
    expect((await mover({ tipo: 'RETIRO', montoClp: 100, motivo: ' ' })).json()).toMatchObject({
      error: 'MOTIVO_REQUERIDO',
    });
    expect((await mover({ tipo: 'OTRO', montoClp: 100, motivo: 'xx' })).statusCode).toBe(400);

    // El cierre congela el esperado con los movimientos y los devuelve.
    const cierre = (await cerrar(17000)).json<{
      sesion: { efectivoEsperadoClp: number; diferenciaClp: number };
      movimientos: unknown[];
    }>();
    expect(cierre.sesion).toMatchObject({ efectivoEsperadoClp: 17000, diferenciaClp: 0 });
    expect(cierre.movimientos).toHaveLength(2);
  });

  it('abre con el efectivo inicial y queda registrada a nombre de quien abrió', async () => {
    const res = await abrir(20000);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      caja: { name: 'Caja 1' },
      sesion: {
        abiertaPor: { id: c.cajeroId, name: 'Cajero' },
        efectivoInicialClp: 20000,
        cerradaEn: null,
        diferenciaClp: null,
      },
      resumen: { efectivoEsperadoClp: 20000, cantidadVentas: 0 },
    });
    expect((await actual()).json()).toMatchObject({ sesion: { efectivoInicialClp: 20000 } });
  });

  it('no abre dos veces la misma caja', async () => {
    await abrir(0);
    const res = await abrir(5000);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'CAJA_ABIERTA',
      mensaje: 'La caja ya está abierta (la abrió Cajero)',
    });
  });

  it('la base también impide dos sesiones abiertas en la misma caja', async () => {
    await abrir(0);
    const registerId = c.db.select().from(t.registers).get()?.id ?? '';
    expect(() =>
      c.db
        .insert(t.cashSessions)
        .values({ registerId, openedBy: c.cajeroId, openingCash: 0 })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it('el resumen suma las ventas por medio de pago y excluye las anuladas', async () => {
    const { sesion } = (await abrir(10000)).json<{ sesion: { id: string } }>();
    venta(sesion.id, 1, { medio: 'EFECTIVO', total: 1293, redondeo: -3 });
    venta(sesion.id, 2, { medio: 'DEBITO', total: 5990 });
    venta(sesion.id, 3, { medio: 'TRANSFERENCIA', total: 2500 });
    venta(sesion.id, 4, { medio: 'EFECTIVO', total: 800, anulada: true });

    const { resumen } = (await actual()).json<{ resumen: Record<string, unknown> }>();
    expect(resumen).toMatchObject({
      cantidadVentas: 3,
      totalVentasClp: 9783,
      redondeoClp: -3,
      totalCobradoClp: 9780,
      anuladas: { cantidad: 1, totalClp: 800 },
      efectivoEsperadoClp: 11290,
      porMedio: {
        EFECTIVO: { cantidad: 1, cobradoClp: 1290 },
        DEBITO: { cantidad: 1, cobradoClp: 5990 },
        CREDITO: { cantidad: 0, cobradoClp: 0 },
        TRANSFERENCIA: { cantidad: 1, cobradoClp: 2500 },
      },
    });
  });

  it('cierra: congela el esperado, guarda lo contado y calcula la diferencia', async () => {
    const { sesion } = (await abrir(10000)).json<{ sesion: { id: string } }>();
    venta(sesion.id, 1, { medio: 'EFECTIVO', total: 1290 });

    const res = await cerrar(11000);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sesion: {
        id: sesion.id,
        cerradaPor: { id: c.cajeroId, name: 'Cajero' },
        efectivoContadoClp: 11000,
        efectivoEsperadoClp: 11290,
        diferenciaClp: -290,
      },
      resumen: { efectivoEsperadoClp: 11290 },
    });
    const fila = c.db.select().from(t.cashSessions).where(eq(t.cashSessions.id, sesion.id)).get();
    expect(fila).toMatchObject({ countedCash: 11000, expectedCash: 11290, closedBy: c.cajeroId });

    // Queda cerrada y se puede volver a abrir.
    expect((await actual()).json()).toMatchObject({ sesion: null });
    expect((await cerrar(0)).json()).toMatchObject({ error: 'CAJA_CERRADA' });
    expect((await abrir(0)).statusCode).toBe(201);

    // La sesión pasada se puede consultar.
    const pasada = await c.app.inject({
      method: 'GET',
      url: `/cash/sessions/${sesion.id}`,
      headers,
    });
    expect(pasada.json()).toMatchObject({ sesion: { diferenciaClp: -290 } });
  });

  it('el dueño puede cerrar una caja que abrió el cajero', async () => {
    await abrir(5000);
    headers = await entrarComo(c, c.duenoId, '1234');
    const res = await cerrar(5000);
    expect(res.json()).toMatchObject({
      sesion: { abiertaPor: { name: 'Cajero' }, cerradaPor: { name: 'Dueño' }, diferenciaClp: 0 },
    });
  });

  it.each([-1, 1.5, '1000', null, 2_000_000_000])('rechaza el monto %j', async (monto) => {
    expect((await abrir(monto)).statusCode).toBe(400);
    expect((await cerrar(monto)).statusCode).toBe(400);
  });

  it('exige sesión', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/cash/current' });
    expect(res.statusCode).toBe(401);
  });

  it('responde 404 si la caja o la sesión no existen', async () => {
    expect((await abrir(0, { registerId: 'no-existe' })).statusCode).toBe(404);
    const r1 = await c.app.inject({ method: 'GET', url: '/cash/current?registerId=x', headers });
    expect(r1.json()).toMatchObject({ error: 'CAJA_NO_ENCONTRADA' });
    const r2 = await c.app.inject({ method: 'GET', url: '/cash/sessions/x', headers });
    expect(r2.statusCode).toBe(404);
    c.db.update(t.registers).set({ active: false }).run();
    expect((await cerrar(0)).statusCode).toBe(404);
  });
});
