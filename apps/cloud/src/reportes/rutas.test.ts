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
      Promise.resolve({
        totalClp: 3500,
        cantidad: 3,
        porMedio: { EFECTIVO: 1500, DEBITO: 2000 },
        devolucionesClp: 0,
      }),
    stockBajo: () =>
      Promise.resolve([
        { id: 'a', name: 'Leche', unit: 'UN', stockQtyMilli: 100, stockMinMilli: 1000 },
      ]),
    datosFiado: () =>
      Promise.resolve({
        clientes: [{ id: 'c1', name: 'Rosa', phone: null, creditLimitClp: 5000, active: true }],
        movimientos: [
          {
            customerId: 'c1',
            type: 'VENTA',
            amountClp: 3780,
            createdAt: new Date('2026-10-29T15:00:00Z'),
          },
        ],
      }),
    datosReporte: () =>
      Promise.resolve({
        ventas: [{ id: 'v1', createdAt: new Date(), totalClp: 2000, paymentMethod: 'EFECTIVO' }],
        lineas: [
          {
            saleId: 'v1',
            productId: 'p1',
            nameSnapshot: 'Leche',
            unit: 'UN',
            qtyMilli: 2000,
            lineTotalClp: 2000,
          },
        ],
        devoluciones: [],
        productos: [
          {
            id: 'p1',
            name: 'Leche',
            unit: 'UN',
            costClp: 700,
            stockMilli: 0,
          },
        ],
      }),
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

  it('reporte del dueño: más vendidos, margen y sugerido de compra', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/summary?dias=30',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      dias: 30,
      ventas: { totalClp: 2000, cantidad: 1 },
      masVendidos: [{ nombre: 'Leche', montoClp: 2000, margenClp: 600 }],
      margen: { margenClp: 600, porcentaje: 30 },
      sugeridoCompra: [{ id: 'p1', nombre: 'Leche' }],
    });
    const porDefecto = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/summary',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(porDefecto.json()).toMatchObject({ dias: 7 });
    const malo = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/summary?dias=5',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(malo.statusCode).toBe(400);
    const sin = await crearAppDePrueba().inject({ method: 'GET', url: '/report/summary' });
    expect(sin.statusCode).toBe(401);
  });

  it('fiado: quién debe y cuánto', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/report/fiado',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      totalClp: 3780,
      deudores: [{ id: 'c1', nombre: 'Rosa', saldoClp: 3780, limiteClp: 5000 }],
    });
    expect(
      (await crearAppDePrueba().inject({ method: 'GET', url: '/report/fiado' })).statusCode,
    ).toBe(401);
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
