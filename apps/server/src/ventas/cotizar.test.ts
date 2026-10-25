import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let headers: { authorization: string };
const id = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get()?.id ?? '';

beforeEach(async () => {
  c = prepararApp();
  headers = await entrarComo(c, c.cajeroId, '0000');
});

const cotizar = (lineas: unknown[]) =>
  c.app.inject({ method: 'POST', url: '/sales/quote', headers, payload: { lineas } });

describe('POST /sales/quote', () => {
  it('calcula con precios y promociones de la base, sin caja abierta y sin guardar', async () => {
    const res = await cotizar([
      { productoId: id('Galletas de vino'), cantidadMilli: 3000 },
      { productoId: id('Tomate'), cantidadMilli: 1250 },
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      totalClp: 2390 + 1863,
      descuentoTotalClp: 280,
      lineas: [
        { nombre: 'Galletas de vino', descuentoClp: 280, totalLineaClp: 2390 },
        { nombre: 'Tomate', totalLineaClp: 1863 },
      ],
    });
    expect(c.db.select().from(t.sales).all()).toHaveLength(0);
  });

  it('carrito vacío = $0', async () => {
    expect((await cotizar([])).json()).toEqual({ totalClp: 0, descuentoTotalClp: 0, lineas: [] });
  });

  it('avisa si un producto ya no está disponible', async () => {
    const res = await cotizar([{ productoId: 'x', cantidadMilli: 1000 }]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' });
  });

  it('exige sesión', async () => {
    expect(
      (await c.app.inject({ method: 'POST', url: '/sales/quote', payload: { lineas: [] } }))
        .statusCode,
    ).toBe(401);
  });
});
