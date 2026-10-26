import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app.js';
import { crearVerificadorJwt } from '../auth/supabase.js';
import type { Db } from '../db/client.js';
import { SECRETO_JWT, firmarJwt } from '../test/ayudas.js';
import type { RepoReportes } from './servicio.js';

function dbFalsa(): Db {
  return { execute: () => Promise.resolve({ rows: [] }) } as unknown as Db;
}

function repoReportesFalso(): RepoReportes {
  return {
    resumenVentas: () =>
      Promise.resolve({ totalClp: 3500, cantidad: 3, porMedio: { EFECTIVO: 1500, DEBITO: 2000 } }),
    stockBajo: () =>
      Promise.resolve([
        { id: 'a', name: 'Leche', unit: 'UN', stockQtyMilli: 100, stockMinMilli: 1000 },
      ]),
    ultimoCierre: () =>
      Promise.resolve({
        id: 'cierre-1',
        registerId: 'r1',
        registerName: 'Caja 1',
        closedAt: '2026-10-25T20:00:00.000Z',
        countedCashClp: 10000,
        expectedCashClp: 9800,
        differenceClp: 200,
        totalVentasClp: 50000,
        cantidadVentas: 12,
      }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

function crearAppDePrueba() {
  return crearApp({
    db: dbFalsa(),
    repoReportes: repoReportesFalso(),
    verificarJwt: crearVerificadorJwt({ secreto: SECRETO_JWT }),
  });
}

describe('rutas de reportes', () => {
  it('ventas del día', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/sales/today',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ totalClp: 3500, cantidad: 3 });
  });

  it('"hoy" empieza a las 00:00 de Chile, no hace 24 h ni a medianoche UTC', async () => {
    // 23:30 del 25-oct en Chile (UTC−3) = 02:30 del 26-oct en UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T02:30:00Z'));
    const repo = repoReportesFalso();
    const resumenVentas = vi.spyOn(repo, 'resumenVentas');
    const app = crearApp({
      db: dbFalsa(),
      repoReportes: repo,
      verificarJwt: crearVerificadorJwt({ secreto: SECRETO_JWT }),
    });
    const token = await firmarJwt('dueno-1');
    const res = await app.inject({
      method: 'GET',
      url: '/report/sales/today',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(resumenVentas).toHaveBeenCalledWith('dueno-1', new Date('2026-10-25T03:00:00Z'));
  });

  it('stock bajo', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/stock-bajo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const productos = res.json<Array<{ id: string; name: string }>>();
    expect(productos).toHaveLength(1);
    expect(productos[0]).toMatchObject({ id: 'a', name: 'Leche' });
  });

  it('rechaza sin JWT válido', async () => {
    const res = await crearAppDePrueba().inject({ method: 'GET', url: '/report/sales/today' });
    expect(res.statusCode).toBe(401);
  });

  it('último cierre de caja', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/cash-closes',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ cierre: { id: 'cierre-1', differenceClp: 200 } });
  });
});
