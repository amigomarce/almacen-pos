import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: { authorization: string };
let dueno: { authorization: string };
let bebida: string;

beforeEach(async () => {
  c = prepararApp();
  cajero = await entrarComo(c, c.cajeroId, '0000');
  dueno = await entrarComo(c, c.duenoId, '1234');
  bebida =
    c.db
      .select()
      .from(t.products)
      .all()
      .find((p) => p.name === 'Bebida cola 1,5 L')?.id ?? '';
  await c.app.inject({
    method: 'POST',
    url: '/cash/open',
    headers: cajero,
    payload: { efectivoInicialClp: 10000 },
  });
});

interface Cliente {
  id: string;
  nombre: string;
  saldoClp: number;
  limiteClp: number | null;
  activo: boolean;
}

const crear = async (cuerpo: object = { nombre: 'Rosa Pérez', limiteClp: 5000 }) => {
  const r = await c.app.inject({
    method: 'POST',
    url: '/customers',
    headers: dueno,
    payload: cuerpo,
  });
  expect(r.statusCode).toBe(201);
  return r.json<Cliente>();
};
const fiar = (clienteId: string | undefined, unidades: number, headers = cajero, extra = {}) =>
  c.app.inject({
    method: 'POST',
    url: '/sales',
    headers,
    payload: {
      id: randomUUID(),
      medioPago: 'FIADO',
      lineas: [{ productoId: bebida, cantidadMilli: unidades * 1000 }],
      ...(clienteId ? { clienteId } : {}),
      ...extra,
    },
  });
const cliente = async (id: string) =>
  (await c.app.inject({ method: 'GET', url: `/customers/${id}`, headers: cajero })).json<{
    cliente: Cliente;
    movimientos: {
      tipo: string;
      montoClp: number;
      medioPago: string | null;
      motivo: string | null;
    }[];
  }>();
const abonar = (id: string, montoClp: number, medioPago = 'EFECTIVO') =>
  c.app.inject({
    method: 'POST',
    url: `/customers/${id}/payments`,
    headers: cajero,
    payload: { montoClp, medioPago },
  });
const resumen = async () =>
  (await c.app.inject({ method: 'GET', url: '/cash/current', headers: cajero })).json<{
    resumen: {
      efectivoEsperadoClp: number;
      porMedio: Record<string, { cantidad: number; cobradoClp: number }>;
      abonos: { cantidad: number; totalClp: number; efectivoClp: number };
    };
  }>().resumen;

describe('fiado', () => {
  it('el dueño crea vecinos; el cajero los ve pero no los crea', async () => {
    const rosa = await crear();
    expect(rosa).toMatchObject({
      nombre: 'Rosa Pérez',
      limiteClp: 5000,
      saldoClp: 0,
      activo: true,
    });
    const prohibido = await c.app.inject({
      method: 'POST',
      url: '/customers',
      headers: cajero,
      payload: { nombre: 'Otro' },
    });
    expect(prohibido.statusCode).toBe(403);
    const lista = await c.app.inject({ method: 'GET', url: '/customers', headers: cajero });
    expect(lista.json<Cliente[]>().map((x) => x.nombre)).toEqual(['Rosa Pérez']);
  });

  it('una venta fiada se carga a la cuenta, no entra a la caja y lleva el vecino en el detalle', async () => {
    const rosa = await crear();
    const antes = await resumen();
    const sin = await fiar(undefined, 1);
    expect(sin.json()).toMatchObject({ error: 'FALTA_CLIENTE' });

    const r = await fiar(rosa.id, 2);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      medioPago: 'FIADO',
      totalClp: 3780,
      pagadoClp: 0,
      vueltoClp: 0,
      cliente: { id: rosa.id, nombre: 'Rosa Pérez', saldoClp: 3780 },
    });
    expect((await cliente(rosa.id)).cliente.saldoClp).toBe(3780);
    const despues = await resumen();
    expect(despues.porMedio['FIADO']).toEqual({ cantidad: 1, cobradoClp: 3780 });
    expect(despues.efectivoEsperadoClp).toBe(antes.efectivoEsperadoClp);
  });

  it('sobre el límite pide la clave del dueño; el dueño con su sesión puede', async () => {
    const rosa = await crear(); // límite $5.000
    expect((await fiar(rosa.id, 2)).statusCode).toBe(201); // $3.780
    const excede = await fiar(rosa.id, 1); // quedaría en $5.670
    expect(excede.statusCode).toBe(403);
    expect(excede.json()).toMatchObject({
      error: 'FIADO_EXCEDE_LIMITE',
      saldoClp: 3780,
      limiteClp: 5000,
      saldoNuevoClp: 5670,
    });
    expect((await fiar(rosa.id, 1, cajero, { pinDueno: '9999' })).statusCode).toBe(401);
    expect((await fiar(rosa.id, 1, cajero, { pinDueno: '1234' })).statusCode).toBe(201);
    expect((await fiar(rosa.id, 1, dueno)).statusCode).toBe(201);
    const { cliente: r, movimientos } = await cliente(rosa.id);
    expect(r.saldoClp).toBe(3780 + 1890 + 1890);
    expect(movimientos[0]?.motivo).toBe('Sobre el límite, autorizado por el dueño');
  });

  it('abonos: bajan la deuda; los de efectivo entran al cajón; no pasan la deuda', async () => {
    const rosa = await crear({ nombre: 'Rosa' });
    await fiar(rosa.id, 2); // $3.780
    const antes = await resumen();
    const r = await abonar(rosa.id, 2000);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      movimiento: { tipo: 'ABONO', montoClp: -2000, medioPago: 'EFECTIVO', usuario: 'Cajero' },
      cliente: { saldoClp: 1780 },
    });
    expect((await abonar(rosa.id, 1000, 'TRANSFERENCIA')).statusCode).toBe(201);
    const despues = await resumen();
    expect(despues.abonos).toEqual({ cantidad: 2, totalClp: 3000, efectivoClp: 2000 });
    expect(despues.efectivoEsperadoClp).toBe(antes.efectivoEsperadoClp + 2000);

    const demas = await abonar(rosa.id, 781);
    expect(demas.statusCode).toBe(400);
    expect(demas.json()).toMatchObject({ error: 'ABONO_EXCEDE_DEUDA' });
    expect((await abonar(rosa.id, 100, 'FIADO')).statusCode).toBe(400);
  });

  it('anular o devolver una venta fiada la descuenta de la cuenta', async () => {
    const rosa = await crear({ nombre: 'Rosa' });
    const v1 = (await fiar(rosa.id, 2)).json<{ id: string; lineas: { id: string }[] }>();
    const v2 = (await fiar(rosa.id, 1)).json<{ id: string }>();
    expect((await cliente(rosa.id)).cliente.saldoClp).toBe(5670);

    const anular = await c.app.inject({
      method: 'POST',
      url: `/sales/${v2.id}/void`,
      headers: dueno,
      payload: { motivo: 'Se arrepintió' },
    });
    expect(anular.statusCode).toBe(200);
    expect(anular.json<{ recordatorio: string }>().recordatorio).toContain(
      'Se descontaron $1.890 de la cuenta de Rosa',
    );
    expect((await cliente(rosa.id)).cliente.saldoClp).toBe(3780);

    const devolver = await c.app.inject({
      method: 'POST',
      url: `/sales/${v1.id}/returns`,
      headers: dueno,
      payload: { items: [{ lineaId: v1.lineas[0]?.id, cantidadMilli: 1000 }], motivo: 'Abollada' },
    });
    expect(devolver.statusCode).toBe(201);
    expect(devolver.json<{ recordatorio: string }>().recordatorio).toContain(
      'Se descontaron $1.890 de la cuenta del vecino',
    );
    const { cliente: r, movimientos } = await cliente(rosa.id);
    expect(r.saldoClp).toBe(1890);
    expect(movimientos.map((m) => m.tipo)).toEqual(['DEVOLUCION', 'ANULACION', 'VENTA', 'VENTA']);
    // La devolución fiada no sale del cajón.
    expect((await resumen()).efectivoEsperadoClp).toBe(10000);
  });

  it('ajustes solo del dueño, con motivo; desactivar impide fiar', async () => {
    const rosa = await crear({ nombre: 'Rosa' });
    await fiar(rosa.id, 1);
    const ajuste = (cuerpo: object, headers = dueno) =>
      c.app.inject({
        method: 'POST',
        url: `/customers/${rosa.id}/adjustments`,
        headers,
        payload: cuerpo,
      });
    expect(
      (await ajuste({ montoClp: -890, motivo: 'Redondeo de buena onda' }, cajero)).statusCode,
    ).toBe(403);
    const r = await ajuste({ montoClp: -890, motivo: 'Redondeo de buena onda' });
    expect(r.json()).toMatchObject({
      movimiento: { tipo: 'AJUSTE', montoClp: -890 },
      cliente: { saldoClp: 1000 },
    });
    expect((await ajuste({ montoClp: 0, motivo: 'Nada que ajustar' })).statusCode).toBe(400);

    await c.app.inject({
      method: 'PATCH',
      url: `/customers/${rosa.id}`,
      headers: dueno,
      payload: { activo: false },
    });
    expect((await fiar(rosa.id, 1)).json()).toMatchObject({ error: 'CLIENTE_INACTIVO' });
    const activos = await c.app.inject({ method: 'GET', url: '/customers', headers: cajero });
    expect(activos.json()).toEqual([]);
    const todos = await c.app.inject({
      method: 'GET',
      url: '/customers?inactivos=1',
      headers: cajero,
    });
    expect(todos.json()).toHaveLength(1);
  });

  it('ordena por deuda y sincroniza vecinos y movimientos', async () => {
    const a = await crear({ nombre: 'Ana' });
    const b = await crear({ nombre: 'Beto' });
    await fiar(a.id, 1);
    await fiar(b.id, 2);
    const porDeuda = await c.app.inject({
      method: 'GET',
      url: '/customers?orden=deuda',
      headers: cajero,
    });
    expect(porDeuda.json<Cliente[]>().map((x) => x.nombre)).toEqual(['Beto', 'Ana']);
    const eventos = c.db.select().from(t.outbox).all();
    expect(eventos.filter((e) => e.entity === 'customers')).toHaveLength(2);
    expect(eventos.filter((e) => e.entity === 'customer_ledger')).toHaveLength(2);
  });

  it('abonar con la caja cerrada no se puede', async () => {
    const rosa = await crear({ nombre: 'Rosa' });
    await fiar(rosa.id, 1);
    await c.app.inject({
      method: 'POST',
      url: '/cash/close',
      headers: cajero,
      payload: { efectivoContadoClp: 0 },
    });
    expect((await abonar(rosa.id, 100)).json()).toMatchObject({ error: 'CAJA_CERRADA' });
    expect(
      (await c.app.inject({ method: 'GET', url: '/customers/nada', headers: cajero })).statusCode,
    ).toBe(404);
  });
});
