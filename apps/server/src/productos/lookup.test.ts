import { calcularDigitoGtin } from '@almacen/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { productBarcodes, products } from '../db/schema.js';
import { crearSemillaFixture } from '../test/semilla-fixture.js';
import { Semilla } from './semilla.js';

const ean = (doce: string) => `${doce}${calcularDigitoGtin(doce)}`;
const LOCAL = ean('780000000001');
const ALTERNATIVO = ean('780000000002');
const BORRADO = ean('780000000003');
/** Balanza: prefijo 20, producto 01234, 00350 g. */
const BALANZA = ean('200123400350');

describe('GET /products/lookup/:barcode', () => {
  const db = abrirDb(':memory:');
  migrar(db);
  const semilla = Semilla.abrir(crearSemillaFixture());
  const app = crearApp({ db, semilla });
  const lookup = (codigo: string) =>
    app.inject({ method: 'GET', url: `/products/lookup/${codigo}` });

  beforeAll(() => {
    const [p] = db
      .insert(products)
      .values([
        { name: 'Bebida cola 1,5 L', barcode: LOCAL, priceClp: 1890, stockQtyMilli: 12_000 },
        { name: 'Pan amasado', unit: 'KG', scaleCode: '01234', priceClp: 2490 },
        { name: 'Borrado', barcode: BORRADO, priceClp: 100, deletedAt: new Date() },
        // Mismo código que la semilla: el local manda.
        { name: 'Quesillo con mi precio', barcode: '7802920000749', priceClp: 2990 },
      ])
      .returning()
      .all();
    if (!p) throw new Error('sin producto');
    db.insert(productBarcodes).values({ barcode: ALTERNATIVO, productId: p.id }).run();
  });

  afterAll(() => semilla?.cerrar());

  it('encuentra un producto del local con precio y stock', async () => {
    const res = await lookup(LOCAL);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      origen: 'LOCAL',
      producto: {
        barcode: LOCAL,
        name: 'Bebida cola 1,5 L',
        unit: 'UN',
        priceClp: 1890,
        stockQtyMilli: 12_000,
      },
    });
  });

  it('encuentra por código alternativo', async () => {
    const res = await lookup(ALTERNATIVO);
    expect(res.json()).toMatchObject({ origen: 'LOCAL', producto: { barcode: LOCAL } });
  });

  it('ignora productos borrados (deleted_at)', async () => {
    expect((await lookup(BORRADO)).json()).toEqual({ origen: 'NO_ENCONTRADO', producto: null });
  });

  it('el local tiene prioridad sobre la semilla', async () => {
    expect((await lookup('7802920000749')).json()).toMatchObject({
      origen: 'LOCAL',
      producto: { name: 'Quesillo con mi precio' },
    });
  });

  it('código de balanza: busca por scale_code y devuelve el peso', async () => {
    expect((await lookup(BALANZA)).json()).toMatchObject({
      origen: 'LOCAL',
      producto: { name: 'Pan amasado', unit: 'KG', priceClp: 2490 },
      balanza: { codigoProducto: '01234', tipo: 'PESO', pesoGramos: 350 },
    });
  });

  it('código de balanza desconocido: NO_ENCONTRADO con los datos de la etiqueta', async () => {
    expect((await lookup(ean('209999900500'))).json()).toEqual({
      origen: 'NO_ENCONTRADO',
      producto: null,
      balanza: { codigoProducto: '99999', tipo: 'PESO', pesoGramos: 500 },
    });
  });

  it('etiqueta de balanza sin valor → 400', async () => {
    const res = await lookup(ean('200123400000'));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BALANZA_INVALIDA' });
  });

  it('busca en la semilla y deja listo el producto para ponerle precio', async () => {
    const otraDb = abrirDb(':memory:');
    migrar(otraDb);
    const res = await crearApp({ db: otraDb, semilla }).inject({
      method: 'GET',
      url: '/products/lookup/7802920000749',
    });
    expect(res.json()).toEqual({
      origen: 'SEMILLA',
      producto: {
        barcode: '7802920000749',
        name: 'Colún Mi Quesillo Fresco y Natural 320 g',
        brand: 'Colún',
        format: '320 g',
        unit: 'UN',
        categorySlug: 'quesos',
        imageUrl:
          'https://images.openfoodfacts.org/images/products/780/292/000/0749/front_es.7.400.jpg',
        seedRef: '7802920000749',
      },
    });
  });

  it('normaliza UPC-A a EAN-13 antes de buscar', async () => {
    expect((await lookup('036000291452')).json()).toMatchObject({
      origen: 'SEMILLA',
      producto: { barcode: '0036000291452' },
    });
  });

  it('no encontrado en ninguna parte', async () => {
    expect((await lookup(ean('780999999999'))).json()).toEqual({
      origen: 'NO_ENCONTRADO',
      producto: null,
    });
  });

  it.each([
    ['dígito verificador malo', '7802920000740', /dígito verificador/],
    ['largo incorrecto', '12345', /8, 12 o 13 dígitos/],
    ['letras', 'abc', /no es válido/],
  ])('código inválido (%s) → 400 en español', async (_caso, codigo, mensaje) => {
    const res = await lookup(codigo);
    expect(res.statusCode).toBe(400);
    const cuerpo = res.json<{ error: string; mensaje: string }>();
    expect(cuerpo.error).toBe('CODIGO_INVALIDO');
    expect(cuerpo.mensaje).toMatch(mensaje);
  });

  it('sin semilla sigue respondiendo', async () => {
    const otraDb = abrirDb(':memory:');
    migrar(otraDb);
    const sin = crearApp({ db: otraDb });
    const res = await sin.inject({ method: 'GET', url: '/products/lookup/7802920000749' });
    expect(res.json()).toEqual({ origen: 'NO_ENCONTRADO', producto: null });
    expect((await sin.inject({ method: 'GET', url: '/health' })).json()).toMatchObject({
      semilla: false,
    });
  });
});
