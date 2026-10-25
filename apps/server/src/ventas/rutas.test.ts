import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let cajero: { authorization: string };
let dueno: { authorization: string };
let p: Record<string, string>;

const producto = (nombre: string) =>
  c.db.select().from(t.products).where(eq(t.products.name, nombre)).get();

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

interface Linea {
  productoId: string | null;
  cantidadMilli: number;
  [k: string]: unknown;
}

const vender = (
  cuerpo: { lineas: Linea[]; medioPago?: string; [k: string]: unknown },
  headers = cajero,
) =>
  c.app.inject({
    method: 'POST',
    url: '/sales',
    headers,
    payload: { id: randomUUID(), medioPago: 'EFECTIVO', ...cuerpo },
  });

const un = (nombre: string, unidades = 1): Linea => ({
  productoId: p[nombre] ?? 'x',
  cantidadMilli: unidades * 1000,
});

interface Venta {
  id: string;
  numero: number;
  estado: string;
  totalClp: number;
  documento: { provider: string; accionCajero: string | null; folioExterno: string | null } | null;
}

describe('POST /sales', () => {
  it('no vende con la caja cerrada', async () => {
    await c.app.inject({
      method: 'POST',
      url: '/cash/close',
      headers: cajero,
      payload: { efectivoContadoClp: 10000 },
    });
    const res = await vender({ lineas: [un('Agua mineral 500 ml')] });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'CAJA_CERRADA', mensaje: 'Abre la caja antes de vender' });
  });

  it('venta en efectivo: precios de la base, redondeo, vuelto, stock y comprobante interno', async () => {
    const res = await vender({
      lineas: [
        // La caja no decide el precio: aunque mande otro, se usa el de la base.
        { ...un('Bebida cola 1,5 L', 2), precioUnitarioClp: 1 },
        { productoId: p['Tomate'] ?? '', cantidadMilli: 1250 },
      ],
      pagadoClp: 10000,
      totalEsperadoClp: 5643,
    });
    expect(res.statusCode).toBe(201);
    const v = res.json<Record<string, unknown>>();
    expect(v).toMatchObject({
      numero: 1,
      estado: 'OK',
      medioPago: 'EFECTIVO',
      totalClp: 5643, // 2 × 1.890 + 1,25 kg × 1.490 (1.862,5 → 1.863)
      redondeoClp: -3,
      totalCobradoClp: 5640,
      pagadoClp: 10000,
      vueltoClp: 4360,
      cajero: { id: c.cajeroId, name: 'Cajero' },
      totales: { afectoClp: 5643, exentoClp: 0, netoClp: 4742, ivaClp: 901 },
      lineas: [
        { nombre: 'Bebida cola 1,5 L', precioUnitarioClp: 1890, totalLineaClp: 3780 },
        { nombre: 'Tomate', unidad: 'KG', cantidadMilli: 1250, totalLineaClp: 1863 },
      ],
      documento: {
        provider: 'MOCK',
        validoComoBoleta: false,
        leyendas: [
          'COMPROBANTE INTERNO – NO VÁLIDO COMO BOLETA',
          'Comprobante N° 1 · Total $5.643',
        ],
        accionCajero: null,
      },
      motivoSinDocumento: null,
      anulacion: null,
    });
    expect(producto('Bebida cola 1,5 L')?.stockQtyMilli).toBe(22_000);
    expect(producto('Tomate')?.stockQtyMilli).toBe(7_250);
    const movs = c.db
      .select()
      .from(t.stockMovements)
      .where(eq(t.stockMovements.type, 'VENTA'))
      .all();
    expect(movs.map((m) => m.qtyMilli).sort((a, b) => a - b)).toEqual([-2000, -1250]);
    expect(c.db.select().from(t.taxDocuments).all()).toHaveLength(1);
  });

  it('aplica la promoción 2 × $1.500', async () => {
    const res = await vender({ lineas: [un('Galletas de vino', 3)] });
    expect(res.json()).toMatchObject({
      totalClp: 2390,
      descuentoTotalClp: 280,
      lineas: [{ descuentoClp: 280, totalLineaClp: 2390 }],
    });
  });

  it('con tarjeta no hay redondeo ni documento: el voucher es la boleta', async () => {
    const res = await vender({
      lineas: [un('Leche entera 1 L')],
      medioPago: 'DEBITO',
      pagadoClp: 50,
    });
    expect(res.json()).toMatchObject({
      totalClp: 1190,
      redondeoClp: 0,
      pagadoClp: 1190,
      vueltoClp: 0,
      documento: null,
      motivoSinDocumento: 'VOUCHER_ES_BOLETA',
    });
    expect(c.db.select().from(t.taxDocuments).all()).toHaveLength(0);
  });

  it('reenviar la misma venta no la duplica', async () => {
    const id = randomUUID();
    const enviar = () =>
      c.app.inject({
        method: 'POST',
        url: '/sales',
        headers: cajero,
        payload: { id, medioPago: 'EFECTIVO', lineas: [un('Agua mineral 500 ml')] },
      });
    const r1 = await enviar();
    const r2 = await enviar();
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(200);
    expect(r2.json<Venta>().numero).toBe(r1.json<Venta>().numero);
    expect(c.db.select().from(t.sales).all()).toHaveLength(1);
    expect(producto('Agua mineral 500 ml')?.stockQtyMilli).toBe(35_000);
  });

  it('numera las ventas en orden', async () => {
    const n1 = (await vender({ lineas: [un('Agua mineral 500 ml')] })).json<Venta>().numero;
    const n2 = (await vender({ lineas: [un('Agua mineral 500 ml')] })).json<Venta>().numero;
    expect([n1, n2]).toEqual([1, 2]);
  });

  it('si los precios cambiaron, rechaza y devuelve el total nuevo', async () => {
    const res = await vender({ lineas: [un('Arroz grado 1')], totalEsperadoClp: 1390 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'TOTAL_CAMBIO',
      mensaje: 'Los precios cambiaron: el total ahora es $1.490',
      totalClp: 1490,
    });
    expect(c.db.select().from(t.sales).all()).toHaveLength(0);
  });

  it('rechaza un pago insuficiente sin guardar nada', async () => {
    const res = await vender({ lineas: [un('Arroz grado 1')], pagadoClp: 1000 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'PAGO_INSUFICIENTE' });
    expect(c.db.select().from(t.sales).all()).toHaveLength(0);
    expect(producto('Arroz grado 1')?.stockQtyMilli).toBe(12_000);
  });

  it('permite stock negativo', async () => {
    const res = await vender({
      lineas: [{ productoId: p['Pan corriente'] ?? '', cantidadMilli: 500 }],
    });
    expect(res.statusCode).toBe(201);
    expect(producto('Pan corriente')?.stockQtyMilli).toBe(-500);
  });

  it('vende por peso desde una etiqueta de balanza', async () => {
    const res = await vender({
      lineas: [{ productoId: p['Queso laminado'] ?? '', cantidadMilli: 250 }],
    });
    expect(res.json()).toMatchObject({ totalClp: 2998 }); // 0,250 × 11.990 = 2.997,5 → 2.998
  });

  it('venta rápida sin producto, y línea exenta', async () => {
    const res = await vender({
      lineas: [
        {
          productoId: null,
          nombre: 'Bolsa',
          unidad: 'UN',
          cantidadMilli: 2000,
          precioUnitarioClp: 50,
        },
        un('Producto exento (ejemplo)'),
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      totalClp: 1100,
      totales: { afectoClp: 100, exentoClp: 1000 },
      lineas: [
        { productoId: null, nombre: 'Bolsa', tipoImpuesto: 'AFECTO' },
        { tipoImpuesto: 'EXENTO' },
      ],
    });
  });

  it('una venta de $0 no genera documento', async () => {
    const res = await vender({
      lineas: [
        {
          productoId: null,
          nombre: 'Regalo',
          unidad: 'UN',
          cantidadMilli: 1000,
          precioUnitarioClp: 0,
        },
      ],
    });
    expect(res.json()).toMatchObject({
      totalClp: 0,
      documento: null,
      motivoSinDocumento: 'TOTAL_CERO',
    });
  });

  it.each([
    [{ productoId: null, cantidadMilli: 1000, nombre: 'Pan' }, 'LINEA_INCOMPLETA'],
    [{ productoId: 'no-existe', cantidadMilli: 1000 }, 'PRODUCTO_NO_ENCONTRADO'],
    [{ productoId: 'AGUA', cantidadMilli: 1500 }, 'CANTIDAD_FRACCIONARIA'],
  ])('rechaza líneas inválidas (%#)', async (linea, error) => {
    const l = {
      ...linea,
      productoId: linea.productoId === 'AGUA' ? (p['Agua mineral 500 ml'] ?? '') : linea.productoId,
    };
    const res = await vender({ lineas: [l] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error });
  });

  it('rechaza un producto desactivado', async () => {
    c.db
      .update(t.products)
      .set({ active: false })
      .where(eq(t.products.name, 'Arroz grado 1'))
      .run();
    const res = await vender({ lineas: [un('Arroz grado 1')] });
    expect(res.json()).toMatchObject({ error: 'PRODUCTO_NO_ENCONTRADO' });
  });

  it.each([
    { id: 'no-es-uuid', medioPago: 'EFECTIVO', lineas: [{ productoId: null, cantidadMilli: 1 }] },
    { lineas: [] },
    { medioPago: 'CHEQUE' },
    { lineas: [{ productoId: 'x', cantidadMilli: 0 }] },
    { lineas: [{ productoId: 'x', cantidadMilli: '1000' }] },
    { pagadoClp: -1 },
  ])('valida el cuerpo %j', async (cuerpo) => {
    const res = await c.app.inject({
      method: 'POST',
      url: '/sales',
      headers: cajero,
      payload: {
        id: randomUUID(),
        medioPago: 'EFECTIVO',
        lineas: [un('Arroz grado 1')],
        ...cuerpo,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('guarda la forma de entrega', async () => {
    const res = await vender({ lineas: [un('Arroz grado 1')], entrega: 'VIRTUAL' });
    expect(res.json()).toMatchObject({ documento: { entrega: 'VIRTUAL' } });
  });

  it('exige sesión y caja existente', async () => {
    const sin = await c.app.inject({ method: 'POST', url: '/sales', payload: {} });
    expect(sin.statusCode).toBe(401);
    const res = await vender({ lineas: [un('Arroz grado 1')], registerId: 'otra' });
    expect(res.statusCode).toBe(404);
  });
});

describe('consultas', () => {
  it('última venta del turno y venta por id', async () => {
    const sinVentas = await c.app.inject({ method: 'GET', url: '/sales/last', headers: cajero });
    expect(sinVentas.statusCode).toBe(404);
    await vender({ lineas: [un('Agua mineral 500 ml')] });
    const v2 = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    const last = await c.app.inject({ method: 'GET', url: '/sales/last', headers: cajero });
    expect(last.json<Venta>().id).toBe(v2.id);
    const porId = await c.app.inject({ method: 'GET', url: `/sales/${v2.id}`, headers: cajero });
    expect(porId.json()).toMatchObject({ numero: 2, totalClp: 1490 });
    const nada = await c.app.inject({ method: 'GET', url: '/sales/x', headers: cajero });
    expect(nada.statusCode).toBe(404);
  });

  it('sin caja abierta no hay última venta', async () => {
    await c.app.inject({
      method: 'POST',
      url: '/cash/close',
      headers: cajero,
      payload: { efectivoContadoClp: 0 },
    });
    const res = await c.app.inject({ method: 'GET', url: '/sales/last', headers: cajero });
    expect(res.statusCode).toBe(404);
  });
});

describe('modalidad PUENTE_MANUAL y folio SII', () => {
  beforeEach(async () => {
    await c.app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: dueno,
      payload: { dteProvider: 'PUENTE_MANUAL' },
    });
  });

  const folio = (id: string, f: string, headers = cajero) =>
    c.app.inject({
      method: 'PATCH',
      url: `/sales/${id}/folio-sii`,
      headers,
      payload: { folio: f },
    });

  it('indica emitir en e-Boleta por el total, y el folio es opcional', async () => {
    const v = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    expect(v.documento).toMatchObject({
      provider: 'PUENTE_MANUAL',
      folioExterno: null,
      accionCajero: 'Emite la boleta en la app e-Boleta del SII por $1.490',
    });
    const res = await folio(v.id, ' 00123 ');
    expect(res.statusCode).toBe(200);
    expect(res.json<Venta>().documento).toMatchObject({ folioExterno: '123', accionCajero: null });
    // Repetir el mismo folio no es error.
    expect((await folio(v.id, '123')).statusCode).toBe(200);
  });

  it('solo el dueño corrige un folio ya registrado', async () => {
    const v = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    await folio(v.id, '123');
    const r = await folio(v.id, '124');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: 'FOLIO_YA_REGISTRADO' });
    expect((await folio(v.id, '124', dueno)).json<Venta>().documento?.folioExterno).toBe('124');
  });

  it('rechaza folios inválidos y ventas sin boleta e-Boleta', async () => {
    const v = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    for (const f of ['0', 'abc', '12345678901']) {
      expect((await folio(v.id, f)).json()).toMatchObject({ error: 'FOLIO_INVALIDO' });
    }
    const tarjeta = (
      await vender({ lineas: [un('Arroz grado 1')], medioPago: 'CREDITO' })
    ).json<Venta>();
    expect((await folio(tarjeta.id, '5')).json()).toMatchObject({ error: 'SIN_BOLETA_E_BOLETA' });
    expect((await folio('no-existe', '5')).statusCode).toBe(404);
  });

  it('una venta MOCK no acepta folio', async () => {
    await c.app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: dueno,
      payload: { dteProvider: 'MOCK' },
    });
    const v = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    expect((await folio(v.id, '5')).statusCode).toBe(409);
  });
});

describe('anular', () => {
  const anular = (id: string, cuerpo: object, headers = cajero) =>
    c.app.inject({ method: 'POST', url: `/sales/${id}/void`, headers, payload: cuerpo });

  it('el cajero anula la última venta con la clave del dueño: devuelve el stock', async () => {
    const v = (await vender({ lineas: [un('Bebida cola 1,5 L', 2)] })).json<Venta>();
    expect((await anular(v.id, { motivo: 'Cliente se arrepintió' })).json()).toMatchObject({
      error: 'FALTA_CLAVE_DUENO',
    });
    expect(
      (await anular(v.id, { motivo: 'Cliente se arrepintió', pinDueno: '0000' })).statusCode,
    ).toBe(401);

    const res = await anular(v.id, { motivo: '  Cliente se arrepintió ', pinDueno: '1234' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      venta: {
        estado: 'ANULADA',
        anulacion: {
          autorizadaPor: { id: c.duenoId, name: 'Dueño' },
          motivo: 'Cliente se arrepintió',
        },
      },
      recordatorio: null,
    });
    expect(producto('Bebida cola 1,5 L')?.stockQtyMilli).toBe(24_000);
    const mov = c.db
      .select()
      .from(t.stockMovements)
      .where(eq(t.stockMovements.type, 'ANULACION'))
      .get();
    expect(mov).toMatchObject({ qtyMilli: 2000, refId: v.id, userId: c.cajeroId });
    // Nada se borra: la venta sigue ahí.
    expect(c.db.select().from(t.sales).all()).toHaveLength(1);
    // La cuadratura ya no la suma.
    const caja = await c.app.inject({ method: 'GET', url: '/cash/current', headers: cajero });
    expect(caja.json()).toMatchObject({
      resumen: {
        cantidadVentas: 0,
        anuladas: { cantidad: 1, totalClp: 3780 },
        efectivoEsperadoClp: 10000,
      },
    });
  });

  it('el cajero no puede anular una venta anterior; el dueño sí, sin clave', async () => {
    const v1 = (await vender({ lineas: [un('Agua mineral 500 ml')] })).json<Venta>();
    await vender({ lineas: [un('Arroz grado 1')] });
    const r = await anular(v1.id, { motivo: 'Error', pinDueno: '1234' });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: 'NO_ES_LA_ULTIMA' });
    const d = await anular(v1.id, { motivo: 'Error' }, dueno);
    expect(d.json()).toMatchObject({ venta: { estado: 'ANULADA' } });
    expect((await anular(v1.id, { motivo: 'Otra vez' }, dueno)).json()).toMatchObject({
      error: 'YA_ANULADA',
    });
  });

  it('no anula ventas de un turno ya cerrado', async () => {
    const v = (await vender({ lineas: [un('Agua mineral 500 ml')] })).json<Venta>();
    await c.app.inject({
      method: 'POST',
      url: '/cash/close',
      headers: cajero,
      payload: { efectivoContadoClp: 10690 },
    });
    await c.app.inject({
      method: 'POST',
      url: '/cash/open',
      headers: cajero,
      payload: { efectivoInicialClp: 0 },
    });
    const res = await anular(v.id, { motivo: 'Tarde' }, dueno);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'SESION_CERRADA' });
  });

  it('recuerda la nota de crédito, anular el pago con tarjeta o devolver la transferencia', async () => {
    const deb = (
      await vender({ lineas: [un('Arroz grado 1')], medioPago: 'DEBITO' })
    ).json<Venta>();
    expect((await anular(deb.id, { motivo: 'Error' }, dueno)).json()).toMatchObject({
      recordatorio: 'Anula también el pago de $1.490 en la máquina de tarjetas',
    });
    const tr = (
      await vender({ lineas: [un('Arroz grado 1')], medioPago: 'TRANSFERENCIA' })
    ).json<Venta>();
    expect((await anular(tr.id, { motivo: 'Error' }, dueno)).json()).toMatchObject({
      recordatorio: 'Devuelve la transferencia de $1.490 al cliente',
    });

    await c.app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: dueno,
      payload: { dteProvider: 'PUENTE_MANUAL' },
    });
    const sinFolio = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    expect((await anular(sinFolio.id, { motivo: 'Error' }, dueno)).json()).toMatchObject({
      recordatorio:
        'Si emitiste la boleta en e-Boleta por $1.490, anúlala en sii.cl con una nota de crédito',
    });
    const conFolio = (await vender({ lineas: [un('Arroz grado 1')] })).json<Venta>();
    await c.app.inject({
      method: 'PATCH',
      url: `/sales/${conFolio.id}/folio-sii`,
      headers: cajero,
      payload: { folio: '77' },
    });
    expect((await anular(conFolio.id, { motivo: 'Error' }, dueno)).json()).toMatchObject({
      recordatorio: 'Anula la boleta folio 77 ($1.490) en sii.cl con una nota de crédito',
    });
  });

  it('valida el motivo y responde 404 si la venta no existe', async () => {
    expect((await anular('x', { motivo: 'ok' }, dueno)).statusCode).toBe(400);
    expect((await anular('x', { motivo: 'Error' }, dueno)).statusCode).toBe(404);
  });
});
