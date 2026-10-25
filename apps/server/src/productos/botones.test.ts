import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: { authorization: string };
let dueno: { authorization: string };
const id = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get()?.id ?? '';

beforeEach(async () => {
  c = prepararApp();
  cajero = await entrarComo(c, c.cajeroId, '0000');
  dueno = await entrarComo(c, c.duenoId, '1234');
});

const listar = async () =>
  (await c.app.inject({ method: 'GET', url: '/quick-buttons', headers: cajero })).json<
    { label: string; producto: { name: string; unit: string; priceClp: number } | null }[]
  >();
const guardar = (botones: unknown[], headers = dueno) =>
  c.app.inject({ method: 'PUT', url: '/quick-buttons', headers, payload: { botones } });

describe('botones de venta rápida', () => {
  it('lista los botones del seed en orden, con el producto', async () => {
    const b = await listar();
    expect(b.map((x) => x.label)).toEqual(['Pan corriente', 'Huevo', 'Tomate']);
    expect(b[0]?.producto).toMatchObject({ name: 'Pan corriente', unit: 'KG', priceClp: 1990 });
  });

  it('no muestra botones de productos desactivados', async () => {
    c.db
      .update(t.products)
      .set({ active: false })
      .where(eq(t.products.name, 'Huevo (unidad)'))
      .run();
    expect((await listar()).map((x) => x.label)).toEqual(['Pan corriente', 'Tomate']);
  });

  it('el dueño los reemplaza (incluye monto libre); los anteriores no se borran', async () => {
    const res = await guardar([
      { label: 'Tomate', productoId: id('Tomate') },
      { label: ' Varios ', productoId: null },
    ]);
    expect(res.statusCode).toBe(200);
    const b = await listar();
    expect(b.map((x) => [x.label, x.producto?.name ?? null])).toEqual([
      ['Tomate', 'Tomate'],
      ['Varios', null],
    ]);
    expect(c.db.select().from(t.quickButtons).all()).toHaveLength(5);
  });

  it('valida: solo el dueño, productos existentes, máximo 24', async () => {
    expect((await guardar([], cajero)).statusCode).toBe(403);
    const r = await guardar([{ label: 'X', productoId: 'no-existe' }]);
    expect(r.json()).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' });
    const muchos = Array.from({ length: 25 }, (_, i) => ({ label: `B${i}`, productoId: null }));
    expect((await guardar(muchos)).statusCode).toBe(400);
    expect((await guardar([{ label: ' ', productoId: null }])).statusCode).toBe(400);
  });
});

describe('venta por monto (ADR-006)', () => {
  beforeEach(async () => {
    await c.app.inject({
      method: 'POST',
      url: '/cash/open',
      headers: cajero,
      payload: { efectivoInicialClp: 0 },
    });
  });

  const vender = (lineas: unknown[]) =>
    c.app.inject({
      method: 'POST',
      url: '/sales',
      headers: cajero,
      payload: { id: randomUUID(), medioPago: 'DEBITO', lineas },
    });

  it('"$1.000 de pan": cobra exacto y descuenta el peso estimado por el servidor', async () => {
    const res = await vender([
      { productoId: id('Pan corriente'), cantidadMilli: 99999, montoFijoClp: 1000 },
    ]);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      totalClp: 1000,
      lineas: [
        {
          nombre: 'Pan corriente',
          unidad: 'KG',
          cantidadMilli: 503,
          precioUnitarioClp: 1990,
          totalLineaClp: 1000,
        },
      ],
    });
    expect(
      c.db.select().from(t.products).where(eq(t.products.name, 'Pan corriente')).get()
        ?.stockQtyMilli,
    ).toBe(-503);
  });

  it('venta rápida libre por kg con monto, y la cotización da lo mismo', async () => {
    const linea = {
      productoId: null,
      nombre: 'Aceitunas',
      unidad: 'KG',
      cantidadMilli: 1,
      precioUnitarioClp: 6000,
      montoFijoClp: 1500,
    };
    const q = await c.app.inject({
      method: 'POST',
      url: '/sales/quote',
      headers: cajero,
      payload: { lineas: [linea] },
    });
    expect(q.json()).toMatchObject({ totalClp: 1500, lineas: [{ cantidadMilli: 250 }] });
    expect((await vender([linea])).json()).toMatchObject({ totalClp: 1500 });
  });

  it('un producto por unidad no se vende por monto', async () => {
    const res = await vender([
      { productoId: id('Huevo (unidad)'), cantidadMilli: 1000, montoFijoClp: 1000 },
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'MONTO_SOLO_KG' });
    const libre = await vender([
      {
        productoId: null,
        nombre: 'X',
        unidad: 'UN',
        cantidadMilli: 1000,
        precioUnitarioClp: 10,
        montoFijoClp: 5,
      },
    ]);
    expect(libre.json()).toMatchObject({ error: 'MONTO_SOLO_KG' });
  });
});
