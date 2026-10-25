import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: { authorization: string };

beforeEach(async () => {
  c = prepararApp();
  cajero = await entrarComo(c, c.cajeroId, '0000');
});

const crear = (cuerpo: object, headers: Record<string, string> = cajero) =>
  c.app.inject({ method: 'POST', url: '/products', headers, payload: cuerpo });

// EAN-13 válido que no está en el seed de desarrollo.
const EAN = '7801234567894';

describe('POST /products (alta rápida)', () => {
  it('crea el producto de la semilla con precio y stock, y queda vendible por código', async () => {
    const res = await crear({
      barcode: EAN,
      name: 'Arroz Grado 2 1 kg',
      brand: 'Marca X',
      format: '1 kg',
      unit: 'UN',
      priceClp: 1390,
      stockInicialMilli: 12000,
      categorySlug: 'arroz',
      seedRef: EAN,
    });
    expect(res.statusCode).toBe(201);
    const p = res.json<{ id: string; categoryId: string }>();
    expect(p).toMatchObject({
      barcode: EAN,
      name: 'Arroz Grado 2 1 kg',
      unit: 'UN',
      priceClp: 1390,
      stockQtyMilli: 12000,
    });

    const fila = c.db.select().from(t.products).where(eq(t.products.id, p.id)).get();
    expect(fila).toMatchObject({ source: 'SEED', seedRef: EAN, taxType: 'AFECTO', active: true });
    expect(
      c.db.select().from(t.priceHistory).where(eq(t.priceHistory.productId, p.id)).all(),
    ).toEqual([expect.objectContaining({ oldPrice: 0, newPrice: 1390, changedBy: c.cajeroId })]);
    expect(
      c.db.select().from(t.stockMovements).where(eq(t.stockMovements.productId, p.id)).all(),
    ).toEqual([expect.objectContaining({ qtyMilli: 12000, type: 'AJUSTE', userId: c.cajeroId })]);

    const lookup = await c.app.inject({ method: 'GET', url: `/products/lookup/${EAN}` });
    expect(lookup.json()).toMatchObject({
      origen: 'LOCAL',
      producto: { id: p.id, priceClp: 1390 },
    });
  });

  it('usa la categoría local con ese nombre o la crea (con su padre)', async () => {
    const r1 = (
      await crear({
        barcode: EAN,
        name: 'Arroz',
        unit: 'UN',
        priceClp: 1000,
        categorySlug: 'arroz',
      })
    ).json<{ categoryId: string }>();
    const arroz = c.db.select().from(t.categories).where(eq(t.categories.id, r1.categoryId)).get();
    const abarrotes = c.db
      .select()
      .from(t.categories)
      .where(eq(t.categories.name, 'Abarrotes'))
      .all();
    expect(abarrotes).toHaveLength(1); // ya existía en el seed: se reutiliza
    expect(arroz).toMatchObject({ name: 'Arroz', parentId: abarrotes[0]?.id });
    const r2 = (
      await crear({
        barcode: '7801234567887',
        name: 'Otro arroz',
        unit: 'UN',
        priceClp: 900,
        categorySlug: 'arroz',
      })
    ).json<{ categoryId: string }>();
    expect(r2.categoryId).toBe(r1.categoryId);
    const r3 = (
      await crear({
        barcode: null,
        name: 'Sin cat',
        unit: 'UN',
        priceClp: 900,
        categorySlug: 'no-existe',
      })
    ).json<{ categoryId: null }>();
    expect(r3.categoryId).toBeNull();
  });

  it('producto nuevo sin código ni semilla, por kg y sin stock', async () => {
    const res = await crear({ name: '  Aceitunas  ', unit: 'KG', priceClp: 6990 });
    expect(res.json()).toMatchObject({
      barcode: null,
      name: 'Aceitunas',
      unit: 'KG',
      stockQtyMilli: 0,
    });
    const id = res.json<{ id: string }>().id;
    expect(c.db.select().from(t.products).where(eq(t.products.id, id)).get()?.source).toBe('LOCAL');
    expect(
      c.db.select().from(t.stockMovements).where(eq(t.stockMovements.productId, id)).all(),
    ).toHaveLength(0);
  });

  it('código ya registrado (también como código alternativo) → 409 con el producto', async () => {
    const r = await crear({ barcode: '7800000000016', name: 'X', unit: 'UN', priceClp: 1 });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      error: 'CODIGO_EXISTE',
      productoId: expect.any(String) as string,
    });
    const alt = await crear({ barcode: '7800000000993', name: 'X', unit: 'UN', priceClp: 1 });
    expect(alt.statusCode).toBe(409);
  });

  it.each([
    [{ barcode: '123', name: 'X', unit: 'UN', priceClp: 1 }, 'CODIGO_INVALIDO'],
    [{ barcode: '7800000000017', name: 'X', unit: 'UN', priceClp: 1 }, 'CODIGO_INVALIDO'],
    [{ barcode: '2001234000017', name: 'X', unit: 'UN', priceClp: 1 }, 'CODIGO_BALANZA'],
    [{ name: 'X', unit: 'UN', priceClp: 1, stockInicialMilli: 1500 }, 'STOCK_FRACCIONARIO'],
  ])('valida %j → %s', async (cuerpo, error) => {
    const r = await crear(cuerpo);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error });
  });

  it.each([
    { name: 'X', unit: 'UN', priceClp: 0 },
    { name: ' ', unit: 'UN', priceClp: 1 },
    { name: 'X', unit: 'LT', priceClp: 1 },
    { unit: 'UN', priceClp: 1 },
  ])('rechaza el cuerpo %j', async (cuerpo) => {
    expect((await crear(cuerpo)).statusCode).toBe(400);
  });

  it('exige sesión', async () => {
    expect((await crear({ name: 'X', unit: 'UN', priceClp: 1 }, {})).statusCode).toBe(401);
  });
});
