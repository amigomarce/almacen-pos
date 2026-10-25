import { describe, expect, it } from 'vitest';
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
  };
}

function crearAppDePrueba() {
  return crearApp({
    db: dbFalsa(),
    repoReportes: repoReportesFalso(),
    verificarJwt: crearVerificadorJwt(SECRETO_JWT),
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
});
