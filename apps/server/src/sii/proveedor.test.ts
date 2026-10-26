import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { MockProvider, PuenteManualProvider, SiiDirectoProvider } from '@almacen/dte';
import { CERTIFICADO_PEM, CLAVE_PRIVADA_PEM, generarCafPrueba } from '@almacen/dte/test';
import { crearApp } from '../app.js';
import { leerConfiguracion } from '../configuracion/servicio.js';
import { abrirDb, type Db } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { products, registers, storeSettings, taxDocuments, users } from '../db/schema.js';
import { sembrar } from '../db/seed.js';
import { CLAVE_SII, DATOS_LOCAL } from '../test/sii.js';
import { entrarComo } from '../test/sesion.js';
import { guardarCafSii, guardarCredencialesSii } from './config.js';
import { enviarPendientesSii, iniciarEnvioSii } from './envio.js';
import { crearProviderDeVenta } from './proveedor.js';

const SEMILLA_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>' +
  '<SII:ESTADO>00</SII:ESTADO><SII:GLOSA>Semilla Generada</SII:GLOSA>' +
  '</SII:RESP_HDR><SII:RESP_BODY><SII:SEMILLA>030530912644</SII:SEMILLA>' +
  '</SII:RESP_BODY></SII:RESPUESTA>';

const TOKEN_XML =
  '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>' +
  '<SII:ESTADO>0</SII:ESTADO><SII:GLOSA>Token Creado</SII:GLOSA></SII:RESP_HDR>' +
  '<SII:RESP_BODY><SII:TOKEN>XAuSbYXiNh9Ik</SII:TOKEN></SII:RESP_BODY></SII:RESPUESTA>';

const ENVIO_JSON = JSON.stringify({
  rut_emisor: '76086428-5',
  rut_envia: '76086428-5',
  trackid: 1014,
  fecha_recepcion: '2026-10-25 18:00:00',
  estado: 'REC',
  file: 'boleta.xml',
});

const ESTADO_JSON = JSON.stringify({
  rut_emisor: '76086428-5',
  rut_envia: '76086428-5',
  trackid: 1014,
  fecha_recepcion: '2026-10-25 18:00:00',
  estado: 'EPR',
  estadistica: [{ tipo: 39, informados: 1, aceptados: 1, rechazados: 0, reparos: 0 }],
  detalle_rep_rech: [{ tipo: 39, folio: 1, estado: 'DOK', descripcion: 'Dte OK', error: [] }],
});

function urlDe(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function fetchFalso(opciones: { envioStatus?: number } = {}): typeof fetch {
  const fn = (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = urlDe(input);
    if (url.endsWith('.semilla')) return Promise.resolve(new Response(SEMILLA_XML));
    if (url.endsWith('.token')) return Promise.resolve(new Response(TOKEN_XML));
    if (url.includes('/boleta.electronica.envio/')) {
      return Promise.resolve(new Response(ESTADO_JSON));
    }
    if (url.endsWith('/boleta.electronica.envio')) {
      return Promise.resolve(
        opciones.envioStatus
          ? new Response('error', { status: opciones.envioStatus })
          : new Response(ENVIO_JSON),
      );
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`));
  };
  return fn;
}

interface AppSii {
  db: Db;
  app: ReturnType<typeof crearApp>;
  cajeroId: string;
  duenoId: string;
  productoId: string;
  reloj: { t: number };
}

function appSii(): AppSii {
  const db = abrirDb(':memory:');
  migrar(db);
  sembrar(db);
  db.update(storeSettings).set(DATOS_LOCAL).where(eq(storeSettings.id, 1)).run();
  guardarCredencialesSii(
    db,
    {
      certificadoPem: CERTIFICADO_PEM,
      clavePrivadaPem: CLAVE_PRIVADA_PEM,
      rutEnvia: DATOS_LOCAL.rut,
      fchResol: '2026-01-01',
      nroResol: 80,
    },
    CLAVE_SII,
  );
  guardarCafSii(db, generarCafPrueba({ tipoDte: 39, desde: 1, hasta: 100 }).xml, CLAVE_SII);
  db.update(storeSettings).set({ dteProvider: 'SII_DIRECTO' }).where(eq(storeSettings.id, 1)).run();

  const cajeroId = db.select().from(users).where(eq(users.role, 'CAJERO')).get()?.id ?? '';
  const duenoId = db.select().from(users).where(eq(users.role, 'DUENO')).get()?.id ?? '';
  const productoId =
    db.select().from(products).where(eq(products.name, 'Arroz grado 1')).get()?.id ?? '';
  return {
    db,
    app: crearApp({ db, claveSii: () => CLAVE_SII }),
    cajeroId,
    duenoId,
    productoId,
    reloj: { t: Date.now() },
  };
}

async function vender(c: AppSii): Promise<{ id: string; documento: Record<string, unknown> }> {
  const cajero = await entrarComo(c, c.cajeroId, '0000');
  await c.app.inject({
    method: 'POST',
    url: '/cash/open',
    headers: cajero,
    payload: { efectivoInicialClp: 10_000 },
  });
  const res = await c.app.inject({
    method: 'POST',
    url: '/sales',
    headers: cajero,
    payload: {
      id: randomUUID(),
      medioPago: 'EFECTIVO',
      lineas: [{ productoId: c.productoId, cantidadMilli: 1000 }],
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe('crearProviderDeVenta', () => {
  it('devuelve el provider de las modalidades sin SII', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    expect(crearProviderDeVenta(db, leerConfiguracion(db))).toBeInstanceOf(PuenteManualProvider);
    db.update(storeSettings).set({ dteProvider: 'MOCK' }).run();
    expect(crearProviderDeVenta(db, leerConfiguracion(db))).toBeInstanceOf(MockProvider);
  });

  it('exige dependencias para SII_DIRECTO', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    leerConfiguracion(db);
    db.update(storeSettings).set({ dteProvider: 'SII_DIRECTO' }).run();
    expect(() => crearProviderDeVenta(db, leerConfiguracion(db))).toThrow(
      expect.objectContaining({ codigo: 'SII_NO_CONFIGURADO' }),
    );
  });

  it('falla si no hay certificado o CAF cargado', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    leerConfiguracion(db);
    db.update(storeSettings)
      .set({ ...DATOS_LOCAL, dteProvider: 'SII_DIRECTO' })
      .run();
    expect(() =>
      crearProviderDeVenta(db, leerConfiguracion(db), { clave: () => CLAVE_SII }),
    ).toThrow(expect.objectContaining({ codigo: 'SII_NO_CONFIGURADO' }));
  });

  it('construye el provider cuando está todo configurado', () => {
    const c = appSii();
    expect(
      crearProviderDeVenta(c.db, leerConfiguracion(c.db), {
        clave: () => CLAVE_SII,
        fetchFn: fetchFalso(),
      }),
    ).toBeInstanceOf(SiiDirectoProvider);
  });
});

describe('venta con emisión directa al SII', () => {
  it('timbra offline, guarda el pendiente y no consume folio al reimprimir', async () => {
    const c = appSii();
    const v = await vender(c);

    expect(v.documento).toMatchObject({
      provider: 'SII_DIRECTO',
      tipoDte: 39,
      folio: 1,
      estadoSii: 'PENDIENTE',
      validoComoBoleta: true,
      accionCajero: null,
    });
    expect(v.documento['leyendas'] as string[]).toContain('Verifique documento en www.sii.cl');

    const fila = c.db.select().from(taxDocuments).get();
    expect(fila).toMatchObject({
      provider: 'SII_DIRECTO',
      dteType: 39,
      folio: 1,
      siiStatus: 'PENDIENTE',
      trackId: null,
    });
    expect(fila?.xml).toContain('<DTE version="1.0"');
    expect(fila?.ted).toContain('<TED');
    expect(c.db.select().from(registers).get()?.name).toBe('Caja 1');

    const antes = c.db.select().from(taxDocuments).get();
    const cajero = await entrarComo(c, c.cajeroId, '0000');
    const detalle = await c.app.inject({ method: 'GET', url: `/sales/${v.id}`, headers: cajero });
    expect(detalle.statusCode).toBe(200);
    expect(detalle.json()).toMatchObject({
      documento: { provider: 'SII_DIRECTO', folio: 1, validoComoBoleta: true },
    });
    expect(c.db.select().from(taxDocuments).all()).toHaveLength(1);
    expect(c.db.select().from(taxDocuments).get()?.folio).toBe(antes?.folio);

    const impresion = await c.app.inject({
      method: 'POST',
      url: `/sales/${v.id}/print`,
      headers: cajero,
    });
    expect(impresion.statusCode).toBe(200);
    const vista = impresion.json<{ impreso: boolean; motivo: string; vistaPrevia: string }>();
    expect(vista).toMatchObject({ impreso: false, motivo: 'SIN_IMPRESORA' });
    expect(vista.vistaPrevia).toContain('BOLETA ELECTRÓNICA');
    expect(vista.vistaPrevia).toContain('Verifique documento en');

    const health = await c.app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toMatchObject({ sii: { pendientes: 1, atrasadas: 0 } });
  });

  it('envía la cola y refleja el estado definitivo del SII', async () => {
    const c = appSii();
    await vender(c);

    const enviadas = await enviarPendientesSii(c.db, {
      clave: () => CLAVE_SII,
      fetchFn: fetchFalso(),
    });
    expect(enviadas).toEqual([{ folio: 1, trackId: '1014', estado: 'ENVIADO', error: null }]);
    expect(c.db.select().from(taxDocuments).get()).toMatchObject({
      siiStatus: 'ENVIADO',
      trackId: '1014',
    });

    const provider = crearProviderDeVenta(c.db, leerConfiguracion(c.db), {
      clave: () => CLAVE_SII,
      fetchFn: fetchFalso(),
    });
    expect(await provider.consultarEstado('1014')).toBe('ACEPTADO');
    expect(c.db.select().from(taxDocuments).get()?.siiStatus).toBe('ACEPTADO');

    expect(await enviarPendientesSii(c.db, { clave: () => CLAVE_SII })).toEqual([]);
  });

  it('registra el error y deja la boleta pendiente si el envío falla', async () => {
    const c = appSii();
    await vender(c);

    const r = await enviarPendientesSii(c.db, {
      clave: () => CLAVE_SII,
      fetchFn: fetchFalso({ envioStatus: 500 }),
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ estado: 'PENDIENTE', trackId: null });
    expect(r[0]?.error).toContain('500');
    expect(c.db.select().from(taxDocuments).get()).toMatchObject({
      siiStatus: 'PENDIENTE',
      attempts: 1,
    });
    expect(c.db.select().from(taxDocuments).get()?.lastError).toContain('500');
  });

  it('el ciclo de fondo envía apenas arranca y se puede detener', async () => {
    const c = appSii();
    await vender(c);
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const detener = iniciarEnvioSii(c.db, {
      clave: () => CLAVE_SII,
      fetchFn: fetchFalso(),
      intervaloMs: 60_000,
      log,
    });

    await vi.waitFor(() => {
      expect(c.db.select().from(taxDocuments).get()?.siiStatus).toBe('ENVIADO');
    });
    detener();
    expect(log.info).toHaveBeenCalledWith(
      { enviadas: 1, conError: 0 },
      'Cola de boletas del SII procesada',
    );
  });

  it('el ciclo de fondo registra una configuración incompleta sin caer', async () => {
    const db = abrirDb(':memory:');
    migrar(db);
    leerConfiguracion(db);
    db.update(storeSettings).set({ dteProvider: 'SII_DIRECTO' }).run();
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const detener = iniciarEnvioSii(db, {
      clave: () => CLAVE_SII,
      intervaloMs: 60_000,
      log,
    });
    await vi.waitFor(() => {
      expect(log.error).toHaveBeenCalled();
    });
    detener();
  });

  it('no hace nada en un local que no emite directo al SII', async () => {
    const db = abrirDb(':memory:');
    migrar(db);
    leerConfiguracion(db);
    expect(await enviarPendientesSii(db, { clave: () => CLAVE_SII })).toEqual([]);
  });
});
