import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let headers: { authorization: string };

beforeEach(async () => {
  c = prepararApp();
  headers = await entrarComo(c, c.cajeroId, '0000');
});

const buscar = async (q: string) => {
  const res = await c.app.inject({
    method: 'GET',
    url: `/products?buscar=${encodeURIComponent(q)}`,
    headers,
  });
  return res.json<{ name: string }[]>().map((p) => p.name);
};

describe('GET /products?buscar=', () => {
  it('busca por nombre sin importar mayúsculas, con todas las palabras', async () => {
    expect(await buscar('leche')).toEqual(['Leche entera 1 L']);
    expect(await buscar('LECHE entera')).toEqual(['Leche entera 1 L']);
    expect(await buscar('leche descremada')).toEqual([]);
  });

  it('busca por marca y por inicio del código', async () => {
    expect((await buscar('Genérica')).length).toBeGreaterThan(0);
    expect(await buscar('780000000005')).toEqual(['Leche entera 1 L']);
  });

  it('devuelve los datos para agregar a la venta', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/products?buscar=tomate', headers });
    expect(res.json()).toEqual([
      expect.objectContaining({
        name: 'Tomate',
        unit: 'KG',
        priceClp: 1490,
        stockQtyMilli: 8500,
        taxType: 'AFECTO',
        barcode: null,
      }),
    ]);
  });

  it('no muestra productos desactivados ni trata % o _ como comodines', async () => {
    c.db.update(t.products).set({ active: false }).where(eq(t.products.name, 'Tomate')).run();
    expect(await buscar('tomate')).toEqual([]);
    expect(await buscar('%')).toEqual([]);
    expect(await buscar('_')).toEqual([]);
  });

  it('texto vacío no devuelve nada; respeta el límite', async () => {
    expect(await buscar('   ')).toEqual([]);
    const res = await c.app.inject({ method: 'GET', url: '/products?buscar=a&limite=2', headers });
    expect(res.json<unknown[]>()).toHaveLength(2);
    const sinQ = await c.app.inject({ method: 'GET', url: '/products', headers });
    expect(sinQ.json()).toEqual([]);
  });

  it('exige sesión', async () => {
    expect((await c.app.inject({ method: 'GET', url: '/products?buscar=x' })).statusCode).toBe(401);
  });
});
