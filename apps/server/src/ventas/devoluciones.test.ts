import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: { authorization: string };
let dueno: { authorization: string };
let p: Record<string, string>;

beforeEach(async () => {
  c = prepararApp();
  cajero = await entrarComo(c, c.cajeroId, '0000');
  dueno = await entrarComo(c, c.duenoId, '1234');
  p = Object.fromEntries(
    c.db
      .select()
      .from(t.products)
      .all()
      .map((x) => [x.name, x.id]),
  );
  await c.app.inject({
    method: 'POST',
    url: '/cash/open',
    headers: cajero,
    payload: { efectivoInicialClp: 10000 },
  });
});

interface Venta {
  id: string;
  totalClp: number;
  lineas: { id: string; nombre: string; devueltoMilli: number; devueltoClp: number }[];
  devoluciones: { totalClp: number }[];
  devueltoClp: number;
}

const vender = async (
  lineas: { productoId: string | null; cantidadMilli: number }[],
  medioPago = 'EFECTIVO',
) => {
  const r = await c.app.inject({
    method: 'POST',
    url: '/sales',
    headers: cajero,
    payload: {
      id: randomUUID(),
      medioPago,
      lineas,
      ...(medioPago === 'EFECTIVO' ? { pagadoClp: 50000 } : {}),
    },
  });
  expect(r.statusCode).toBe(201);
  return r.json<Venta>();
};
const devolver = (ventaId: string, cuerpo: object, headers = dueno) =>
  c.app.inject({ method: 'POST', url: `/sales/${ventaId}/returns`, headers, payload: cuerpo });
const stock = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get()?.stockQtyMilli ?? 0;
const esperado = async () =>
  (await c.app.inject({ method: 'GET', url: '/cash/current', headers: cajero })).json<{
    resumen: { efectivoEsperadoClp: number; devoluciones: { cantidad: number; totalClp: number } };
  }>().resumen;

describe('devolución parcial', () => {
  it('devuelve una parte: stock, efectivo, detalle de la venta y sincronización', async () => {
    const v = await vender([{ productoId: p['Bebida cola 1,5 L'] ?? '', cantidadMilli: 2000 }]);
    const linea = v.lineas[0];
    if (!linea) throw new Error('sin línea');
    const stockAntes = stock('Bebida cola 1,5 L');
    const antes = await esperado();

    const r = await devolver(v.id, {
      items: [{ lineaId: linea.id, cantidadMilli: 1000 }],
      motivo: 'Venía abollada',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      devolucion: {
        totalClp: 1890,
        aEntregarClp: 1890,
        medioPago: 'EFECTIVO',
        motivo: 'Venía abollada',
        autorizadaPor: { id: c.duenoId },
        items: [
          { lineaId: linea.id, nombre: 'Bebida cola 1,5 L', cantidadMilli: 1000, montoClp: 1890 },
        ],
      },
    });
    expect(r.json<{ recordatorio: string }>().recordatorio).toBe('Entrega $1.890 en efectivo.');
    expect(stock('Bebida cola 1,5 L')).toBe(stockAntes + 1000);

    const despues = await esperado();
    expect(despues.efectivoEsperadoClp).toBe(antes.efectivoEsperadoClp - 1890);
    expect(despues.devoluciones).toMatchObject({ cantidad: 1, totalClp: 1890 });

    const detalle = (
      await c.app.inject({ method: 'GET', url: `/sales/${v.id}`, headers: cajero })
    ).json<Venta>();
    expect(detalle.lineas[0]).toMatchObject({ devueltoMilli: 1000, devueltoClp: 1890 });
    expect(detalle.devueltoClp).toBe(1890);

    const turno = (
      await c.app.inject({ method: 'GET', url: '/sales/turno', headers: cajero })
    ).json<{ id: string; devueltoClp: number }[]>();
    expect(turno[0]).toMatchObject({ id: v.id, devueltoClp: 1890 });

    const eventos = c.db.select().from(t.outbox).all();
    expect(eventos.some((e) => e.entity === 'sale_returns')).toBe(true);
    expect(
      eventos.some(
        (e) =>
          e.entity === 'stock_movements' && (e.payload as { type: string }).type === 'ANULACION',
      ),
    ).toBe(true);

    // No se puede devolver más de lo que queda, ni anular la venta entera después.
    const demas = await devolver(v.id, {
      items: [{ lineaId: linea.id, cantidadMilli: 2000 }],
      motivo: 'Otra vez',
    });
    expect(demas.statusCode).toBe(400);
    expect(demas.json()).toMatchObject({ error: 'DEVOLUCION_EXCEDE' });
    const anular = await c.app.inject({
      method: 'POST',
      url: `/sales/${v.id}/void`,
      headers: dueno,
      payload: { motivo: 'Error' },
    });
    expect(anular.statusCode).toBe(409);
    expect(anular.json()).toMatchObject({ error: 'TIENE_DEVOLUCIONES' });
  });

  it('el cajero necesita la clave del dueño', async () => {
    const v = await vender([{ productoId: p['Bebida cola 1,5 L'] ?? '', cantidadMilli: 1000 }]);
    const item = {
      items: [{ lineaId: v.lineas[0]?.id ?? '', cantidadMilli: 1000 }],
      motivo: 'Cambio',
    };
    const sin = await devolver(v.id, item, cajero);
    expect(sin.statusCode).toBe(403);
    expect(sin.json()).toMatchObject({ error: 'FALTA_CLAVE_DUENO' });
    const mala = await devolver(v.id, { ...item, pinDueno: '9999' }, cajero);
    expect(mala.statusCode).toBe(401);
    const ok = await devolver(v.id, { ...item, pinDueno: '1234' }, cajero);
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ devolucion: { autorizadaPor: { id: c.duenoId } } });
  });

  it('con tarjeta no toca el efectivo y recuerda reversar en la máquina', async () => {
    const v = await vender(
      [{ productoId: p['Bebida cola 1,5 L'] ?? '', cantidadMilli: 2000 }],
      'DEBITO',
    );
    const antes = await esperado();
    const r = await devolver(v.id, {
      items: [{ lineaId: v.lineas[0]?.id ?? '', cantidadMilli: 1000 }],
      motivo: 'Cambio de opinión',
    });
    expect(r.json<{ recordatorio: string }>().recordatorio).toContain('máquina de tarjetas');
    expect((await esperado()).efectivoEsperadoClp).toBe(antes.efectivoEsperadoClp);
  });

  it('venta rápida sin producto: devuelve el monto sin tocar stock', async () => {
    const r = await c.app.inject({
      method: 'POST',
      url: '/sales',
      headers: cajero,
      payload: {
        id: randomUUID(),
        medioPago: 'EFECTIVO',
        pagadoClp: 5000,
        lineas: [
          {
            productoId: null,
            nombre: 'Bolsa',
            unidad: 'UN',
            cantidadMilli: 2000,
            precioUnitarioClp: 50,
          },
        ],
      },
    });
    expect(r.statusCode).toBe(201);
    const v = r.json<Venta>();
    const movimientosAntes = c.db.select().from(t.stockMovements).all().length;
    const d = await devolver(v.id, {
      items: [{ lineaId: v.lineas[0]?.id ?? '', cantidadMilli: 1000 }],
      motivo: 'Estaba rota',
    });
    expect(d.statusCode).toBe(201);
    expect(c.db.select().from(t.stockMovements).all()).toHaveLength(movimientosAntes);
  });

  it('rechaza ventas anuladas, inexistentes y con la caja cerrada', async () => {
    const v = await vender([{ productoId: p['Bebida cola 1,5 L'] ?? '', cantidadMilli: 1000 }]);
    const item = {
      items: [{ lineaId: v.lineas[0]?.id ?? '', cantidadMilli: 1000 }],
      motivo: 'Xyz',
    };
    expect((await devolver('no-existe', item)).statusCode).toBe(404);
    await c.app.inject({
      method: 'POST',
      url: `/sales/${v.id}/void`,
      headers: dueno,
      payload: { motivo: 'Error' },
    });
    expect((await devolver(v.id, item)).json()).toMatchObject({ error: 'YA_ANULADA' });

    const v2 = await vender([{ productoId: p['Bebida cola 1,5 L'] ?? '', cantidadMilli: 1000 }]);
    await c.app.inject({
      method: 'POST',
      url: '/cash/close',
      headers: cajero,
      payload: { efectivoContadoClp: 0 },
    });
    const cerrada = await devolver(v2.id, {
      items: [{ lineaId: v2.lineas[0]?.id ?? '', cantidadMilli: 1000 }],
      motivo: 'Xyz',
    });
    expect(cerrada.json()).toMatchObject({ error: 'CAJA_CERRADA' });
    expect(
      (await c.app.inject({ method: 'GET', url: '/sales/turno', headers: cajero })).json(),
    ).toEqual([]);
  });
});
