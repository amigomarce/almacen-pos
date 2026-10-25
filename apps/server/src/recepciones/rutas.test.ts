import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: Record<string, string>;
const id = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get()?.id ?? '';
const fila = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get();

beforeEach(async () => {
  c = prepararApp();
  cajero = await entrarComo(c, c.cajeroId, '0000');
});

const recibir = (lineas: unknown[]) =>
  c.app.inject({ method: 'POST', url: '/receptions', headers: cajero, payload: { lineas } });

describe('POST /receptions', () => {
  it('suma stock, actualiza el costo promedio y deja los movimientos', async () => {
    // Cola: 24 en stock a $1.350; llegan 12 a $1.500 → (24×1350 + 12×1500)/36 = $1.400.
    const res = await recibir([
      { productoId: id('Bebida cola 1,5 L'), cantidadMilli: 12000, costoUnitarioClp: 1500 },
      { productoId: id('Tomate'), cantidadMilli: 4500 },
    ]);
    expect(res.statusCode).toBe(201);
    const r = res.json<{ id: string; lineas: unknown[] }>();
    expect(r.lineas).toEqual([
      {
        productoId: id('Bebida cola 1,5 L'),
        nombre: 'Bebida cola 1,5 L',
        cantidadMilli: 12000,
        stockAnteriorMilli: 24000,
        stockNuevoMilli: 36000,
        costoAnteriorClp: 1350,
        costoNuevoClp: 1400,
      },
      expect.objectContaining({
        nombre: 'Tomate',
        stockNuevoMilli: 13000,
        costoNuevoClp: fila('Tomate')?.costClp ?? null,
      }),
    ]);
    expect(fila('Bebida cola 1,5 L')).toMatchObject({ stockQtyMilli: 36000, costClp: 1400 });
    const movs = c.db.select().from(t.stockMovements).where(eq(t.stockMovements.refId, r.id)).all();
    expect(movs.map((m) => [m.type, m.qtyMilli, m.userId])).toEqual([
      ['RECEPCION', 12000, c.cajeroId],
      ['RECEPCION', 4500, c.cajeroId],
    ]);
  });

  it('el mismo producto dos veces se pondera en orden', async () => {
    const pan = id('Pan corriente'); // stock 0, sin costo
    const r = await recibir([
      { productoId: pan, cantidadMilli: 10000, costoUnitarioClp: 1000 },
      { productoId: pan, cantidadMilli: 10000, costoUnitarioClp: 1200 },
    ]);
    expect(r.statusCode).toBe(201);
    expect(fila('Pan corriente')).toMatchObject({ stockQtyMilli: 20000, costClp: 1100 });
  });

  it('todo o nada: una línea mala no guarda las otras', async () => {
    const r = await recibir([
      { productoId: id('Arroz grado 1'), cantidadMilli: 1000 },
      { productoId: id('Huevo (unidad)'), cantidadMilli: 1500 },
    ]);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'CANTIDAD_FRACCIONARIA' });
    expect(fila('Arroz grado 1')?.stockQtyMilli).toBe(12000);
  });

  it('rechaza productos inexistentes o desactivados, y cuerpos inválidos', async () => {
    expect((await recibir([{ productoId: 'x', cantidadMilli: 1000 }])).json()).toMatchObject({
      error: 'PRODUCTO_NO_ENCONTRADO',
    });
    c.db
      .update(t.products)
      .set({ active: false })
      .where(eq(t.products.name, 'Arroz grado 1'))
      .run();
    expect(
      (await recibir([{ productoId: id('Arroz grado 1'), cantidadMilli: 1000 }])).statusCode,
    ).toBe(400);
    expect((await recibir([])).statusCode).toBe(400);
    expect((await recibir([{ productoId: 'x', cantidadMilli: 0 }])).statusCode).toBe(400);
    expect(
      (await c.app.inject({ method: 'POST', url: '/receptions', payload: { lineas: [] } }))
        .statusCode,
    ).toBe(401);
  });
});
