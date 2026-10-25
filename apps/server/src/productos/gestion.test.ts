import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: Record<string, string>;
let dueno: Record<string, string>;
const id = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get()?.id ?? '';
const fila = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get();

beforeEach(async () => {
  c = prepararApp();
  cajero = await entrarComo(c, c.cajeroId, '0000');
  dueno = await entrarComo(c, c.duenoId, '1234');
});

const editar = (nombre: string, cambios: object, headers = dueno) =>
  c.app.inject({ method: 'PATCH', url: `/products/${id(nombre)}`, headers, payload: cambios });
const ajustar = (nombre: string, cuerpo: object, headers = dueno) =>
  c.app.inject({ method: 'POST', url: `/products/${id(nombre)}/stock`, headers, payload: cuerpo });
const listar = async (q: string) =>
  (await c.app.inject({ method: 'GET', url: `/products?${q}`, headers: cajero }))
    .json<{ name: string }[]>()
    .map((p) => p.name);

describe('detalle de producto', () => {
  it('trae categoría, costo, margen y códigos alternativos', async () => {
    const res = await c.app.inject({
      method: 'GET',
      url: `/products/${id('Agua mineral 500 ml')}`,
      headers: cajero,
    });
    expect(res.json()).toMatchObject({
      name: 'Agua mineral 500 ml',
      categoria: 'Bebidas',
      priceClp: 690,
      barcodesAlternativos: ['7800000000993'],
      active: true,
    });
    const cola = await c.app.inject({
      method: 'GET',
      url: `/products/${id('Bebida cola 1,5 L')}`,
      headers: cajero,
    });
    expect(cola.json()).toMatchObject({ costClp: 1350, margen: 29 });
    expect(
      (await c.app.inject({ method: 'GET', url: '/products/x', headers: cajero })).statusCode,
    ).toBe(404);
  });
});

describe('editar producto (dueño)', () => {
  it('cambia el precio y lo deja en el historial', async () => {
    const res = await editar('Arroz grado 1', {
      priceClp: 1590,
      costClp: 1100,
      stockMinMilli: 6000,
      brand: ' Tucapel ',
      format: '',
    });
    expect(res.json()).toMatchObject({
      priceClp: 1590,
      costClp: 1100,
      stockMinMilli: 6000,
      brand: 'Tucapel',
      format: null,
      margen: 31,
    });
    expect(fila('Arroz grado 1')?.version).toBe(2);
    const h = c.db
      .select()
      .from(t.priceHistory)
      .where(eq(t.priceHistory.productId, id('Arroz grado 1')))
      .all();
    expect(h).toEqual([
      expect.objectContaining({ oldPrice: 1490, newPrice: 1590, changedBy: c.duenoId }),
    ]);
    // Sin cambio de precio no se agrega historial.
    await editar('Arroz grado 1', { priceClp: 1590 });
    expect(
      c.db
        .select()
        .from(t.priceHistory)
        .where(eq(t.priceHistory.productId, id('Arroz grado 1')))
        .all(),
    ).toHaveLength(1);
  });

  it('el cajero no puede editar', async () => {
    expect((await editar('Arroz grado 1', { priceClp: 1 }, cajero)).statusCode).toBe(403);
  });

  it('código de barras: valida, normaliza y no repite', async () => {
    expect((await editar('Arroz grado 1', { barcode: '123' })).json()).toMatchObject({
      error: 'CODIGO_INVALIDO',
    });
    expect((await editar('Arroz grado 1', { barcode: '7800000000016' })).json()).toMatchObject({
      error: 'CODIGO_EXISTE',
    });
    expect((await editar('Arroz grado 1', { barcode: '7800000000993' })).json()).toMatchObject({
      error: 'CODIGO_EXISTE',
    });
    expect((await editar('Arroz grado 1', { barcode: '2001234000017' })).json()).toMatchObject({
      error: 'CODIGO_BALANZA',
    });
    expect((await editar('Arroz grado 1', { barcode: '7801234567894' })).json()).toMatchObject({
      barcode: '7801234567894',
    });
    expect((await editar('Arroz grado 1', { barcode: null })).json()).toMatchObject({
      barcode: null,
    });
  });

  it('código de balanza: solo por kg y sin repetir', async () => {
    expect((await editar('Tomate', { scaleCode: '01234' })).json()).toMatchObject({
      error: 'BALANZA_EXISTE',
    });
    expect((await editar('Arroz grado 1', { scaleCode: '00077' })).json()).toMatchObject({
      error: 'BALANZA_SOLO_KG',
    });
    expect((await editar('Tomate', { scaleCode: '00077' })).json()).toMatchObject({
      scaleCode: '00077',
    });
    expect((await editar('Tomate', { scaleCode: '' })).json()).toMatchObject({ scaleCode: null });
    expect((await editar('Tomate', { scaleCode: '12' })).statusCode).toBe(400);
  });

  it('unidad: no se cambia si tiene ventas ni con stock con decimales', async () => {
    expect((await editar('Tomate', { unit: 'UN' })).json()).toMatchObject({
      error: 'STOCK_FRACCIONARIO',
    });
    expect((await editar('Arroz grado 1', { unit: 'KG' })).json()).toMatchObject({ unit: 'KG' });
    c.db
      .insert(t.cashSessions)
      .values({
        registerId: c.db.select().from(t.registers).get()?.id ?? '',
        openedBy: c.cajeroId,
        openingCash: 0,
      })
      .run();
    const venta = c.db
      .insert(t.sales)
      .values({
        number: 1,
        registerId: c.db.select().from(t.registers).get()?.id ?? '',
        cashierId: c.cajeroId,
        totalClp: 1,
        paymentMethod: 'DEBITO',
        paidClp: 1,
      })
      .returning()
      .get();
    c.db
      .insert(t.saleItems)
      .values({
        saleId: venta.id,
        productId: id('Huevo (unidad)'),
        nameSnapshot: 'Huevo',
        unit: 'UN',
        qtyMilli: 1000,
        unitPriceClp: 1,
        taxType: 'AFECTO',
        lineTotalClp: 1,
      })
      .run();
    expect((await editar('Huevo (unidad)', { unit: 'KG' })).json()).toMatchObject({
      error: 'UNIDAD_CON_VENTAS',
    });
  });

  it('stock mínimo entero en productos por unidad; desactivar y volver a activar', async () => {
    expect((await editar('Arroz grado 1', { stockMinMilli: 1500 })).json()).toMatchObject({
      error: 'STOCK_FRACCIONARIO',
    });
    expect((await editar('Arroz grado 1', { active: false })).json()).toMatchObject({
      active: false,
    });
    expect(await listar('buscar=arroz')).toEqual([]);
    expect(await listar('filtro=INACTIVOS')).toEqual(['Arroz grado 1']);
    expect((await editar('Arroz grado 1', { active: true })).json()).toMatchObject({
      active: true,
    });
  });

  it('valida el cuerpo y responde 404', async () => {
    expect((await editar('Arroz grado 1', {})).statusCode).toBe(400);
    expect((await editar('Arroz grado 1', { priceClp: 0 })).statusCode).toBe(400);
    const r = await c.app.inject({
      method: 'PATCH',
      url: '/products/x',
      headers: dueno,
      payload: { priceClp: 1 },
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('filtros del listado', () => {
  it('stock bajo, sin stock y sin categoría', async () => {
    // Seed: Pan sin stock; Leche 2 unidades.
    await editar('Leche entera 1 L', { stockMinMilli: 2000 });
    expect(await listar('filtro=SIN_STOCK')).toEqual(['Pan corriente']);
    expect(await listar('filtro=STOCK_BAJO')).toEqual(['Leche entera 1 L', 'Pan corriente']);
    expect(await listar('filtro=STOCK_BAJO&buscar=leche')).toEqual(['Leche entera 1 L']);
    await c.app.inject({
      method: 'POST',
      url: '/products',
      headers: cajero,
      payload: { name: 'Sin cat', unit: 'UN', priceClp: 100 },
    });
    expect(await listar('filtro=SIN_CATEGORIA')).toEqual(['Sin cat']);
    expect(await listar('filtro=OTRO')).toEqual([]);
  });

  it('el listado trae costo, stock mínimo y estado', async () => {
    const res = await c.app.inject({
      method: 'GET',
      url: '/products?buscar=cola',
      headers: cajero,
    });
    expect(res.json()).toEqual([
      expect.objectContaining({ costClp: 1350, stockMinMilli: null, active: true }),
    ]);
  });
});

describe('ajustes de stock (dueño)', () => {
  it('conteo: el stock pasa a lo contado y queda el ajuste por la diferencia', async () => {
    const res = await ajustar('Arroz grado 1', { tipo: 'CONTEO', stockContadoMilli: 10000 });
    expect(res.json()).toMatchObject({ stockQtyMilli: 10000 });
    const movs = c.db
      .select()
      .from(t.stockMovements)
      .where(eq(t.stockMovements.productId, id('Arroz grado 1')))
      .all();
    expect(movs.at(-1)).toMatchObject({ qtyMilli: -2000, type: 'AJUSTE', userId: c.duenoId });
    // Contar lo mismo no agrega movimientos.
    await ajustar('Arroz grado 1', { tipo: 'CONTEO', stockContadoMilli: 10000 });
    expect(
      c.db
        .select()
        .from(t.stockMovements)
        .where(eq(t.stockMovements.productId, id('Arroz grado 1')))
        .all(),
    ).toHaveLength(movs.length);
  });

  it('merma: descuenta lo perdido', async () => {
    const res = await ajustar('Tomate', { tipo: 'MERMA', cantidadMilli: 750 });
    expect(res.json()).toMatchObject({ stockQtyMilli: 7750 });
    const movs = c.db
      .select()
      .from(t.stockMovements)
      .where(eq(t.stockMovements.productId, id('Tomate')))
      .all();
    expect(movs.at(-1)).toMatchObject({ qtyMilli: -750, type: 'MERMA' });
  });

  it('valida', async () => {
    expect(
      (await ajustar('Arroz grado 1', { tipo: 'MERMA', cantidadMilli: 500 })).json(),
    ).toMatchObject({ error: 'STOCK_FRACCIONARIO' });
    expect((await ajustar('Arroz grado 1', { tipo: 'MERMA', cantidadMilli: 0 })).statusCode).toBe(
      400,
    );
    expect((await ajustar('Arroz grado 1', { tipo: 'OTRO' })).statusCode).toBe(400);
    expect(
      (await ajustar('Arroz grado 1', { tipo: 'CONTEO', stockContadoMilli: 1000 }, cajero))
        .statusCode,
    ).toBe(403);
    const r = await c.app.inject({
      method: 'POST',
      url: '/products/x/stock',
      headers: dueno,
      payload: { tipo: 'CONTEO', stockContadoMilli: 0 },
    });
    expect(r.statusCode).toBe(404);
  });
});
