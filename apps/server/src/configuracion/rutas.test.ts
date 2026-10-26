import { generarCafPrueba } from '@almacen/dte/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import * as t from '../db/schema.js';
import { guardarCafSii, guardarCredencialesSii } from '../sii/config.js';
import { CERTIFICADO, CLAVE_SII, DATOS_LOCAL } from '../test/sii.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';
import { leerConfiguracion } from './servicio.js';

let c: CtxPrueba;
let dueno: { authorization: string };

beforeEach(async () => {
  c = prepararApp();
  dueno = await entrarComo(c, c.duenoId, '1234');
});

const editar = (payload: object, headers = dueno, app = c.app) =>
  app.inject({ method: 'PATCH', url: '/settings', headers, payload });

describe('modalidad de boleta', () => {
  it('una instalación real (sin db:seed) parte en PUENTE_MANUAL, nunca en MOCK', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    expect(db.select().from(t.storeSettings).all()).toHaveLength(0);
    const conf = leerConfiguracion(db);
    expect(conf).toMatchObject({
      dteProvider: 'PUENTE_MANUAL',
      boletaConfirmada: false,
      modoPrueba: false,
      version: 1,
    });
    expect(db.select().from(t.storeSettings).all()).toHaveLength(1);
    // La columna también tiene ese valor por defecto.
    db.delete(t.storeSettings).run();
    db.insert(t.storeSettings).values({}).run();
    expect(leerConfiguracion(db).dteProvider).toBe('PUENTE_MANUAL');
  });

  it('los datos de desarrollo (db:seed) usan MOCK y lo informan como modo prueba', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/settings', headers: dueno });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      razonSocial: 'Almacén de Prueba',
      dteProvider: 'MOCK',
      modoPrueba: true,
      modeloEmision: 'SOLO_NO_ELECTRONICOS',
      cashRoundingEnabled: true,
      modalidadesDisponibles: ['PUENTE_MANUAL', 'MOCK'],
    });
  });

  it('/health informa la modalidad sin pedir sesión (aviso en la pantalla de PIN)', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toMatchObject({ modalidadBoleta: 'MOCK', modoPrueba: true });
    await editar({ dteProvider: 'PUENTE_MANUAL' });
    const despues = await c.app.inject({ method: 'GET', url: '/health' });
    expect(despues.json()).toMatchObject({ modalidadBoleta: 'PUENTE_MANUAL', modoPrueba: false });
  });

  it('el dueño cambia la modalidad y los datos del local', async () => {
    const res = await editar({
      dteProvider: 'PUENTE_MANUAL',
      rut: '76.086.428-5',
      razonSocial: '  Almacén Don Pepe ',
      giro: '',
      cashRoundingEnabled: false,
      modeloEmision: 'TODO_MEDIO_PAGO',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      dteProvider: 'PUENTE_MANUAL',
      boletaConfirmada: true,
      modoPrueba: false,
      rut: '76.086.428-5',
      razonSocial: 'Almacén Don Pepe',
      giro: null,
      comuna: 'Santiago',
      cashRoundingEnabled: false,
      modeloEmision: 'TODO_MEDIO_PAGO',
      version: 2,
    });
  });

  it('normaliza el RUT y rechaza uno inválido', async () => {
    expect((await editar({ rut: '760864285' })).json()).toMatchObject({ rut: '76.086.428-5' });
    const malo = await editar({ rut: '76.086.428-0' });
    expect(malo.statusCode).toBe(400);
    expect(malo.json()).toEqual({ error: 'RUT_INVALIDO', mensaje: 'El RUT no es válido' });
    expect((await editar({ rut: null })).json()).toMatchObject({ rut: null });
  });

  it('SII_DIRECTO exige certificado y CAF cargados', async () => {
    await editar({
      rut: DATOS_LOCAL.rut,
      razonSocial: DATOS_LOCAL.razonSocial,
      giro: DATOS_LOCAL.giro,
      direccion: DATOS_LOCAL.direccion,
      comuna: DATOS_LOCAL.comuna,
    });
    const res = await editar({ dteProvider: 'SII_DIRECTO' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'SII_NO_CONFIGURADO' });
  });

  it('habilita SII_DIRECTO con certificado, CAF y datos legales', async () => {
    await editar({
      rut: DATOS_LOCAL.rut,
      razonSocial: DATOS_LOCAL.razonSocial,
      giro: DATOS_LOCAL.giro,
      direccion: DATOS_LOCAL.direccion,
      comuna: DATOS_LOCAL.comuna,
    });
    guardarCredencialesSii(
      c.db,
      {
        ...CERTIFICADO,
        rutEnvia: DATOS_LOCAL.rut,
        fchResol: '2026-01-01',
        nroResol: 80,
      },
      CLAVE_SII,
    );
    guardarCafSii(c.db, generarCafPrueba({ tipoDte: 39 }).xml, CLAVE_SII);

    const conf = await c.app.inject({ method: 'GET', url: '/settings', headers: dueno });
    expect(conf.json()).toMatchObject({
      siiListo: true,
      modalidadesDisponibles: ['PUENTE_MANUAL', 'MOCK', 'SII_DIRECTO'],
    });

    const res = await editar({ dteProvider: 'SII_DIRECTO' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      dteProvider: 'SII_DIRECTO',
      siiFchResol: '2026-01-01',
      siiNroResol: 80,
    });

    const incompleto = await editar({ giro: '' });
    expect(incompleto.statusCode).toBe(400);
    expect(incompleto.json()).toMatchObject({ error: 'DATOS_LOCAL_INCOMPLETOS' });
  });

  it('guarda y valida la URL de nube y la retención del respaldo', async () => {
    const guardada = await editar({ cloudUrl: 'https://api.ejemplo.cl/' });
    expect(guardada.json()).toMatchObject({
      cloudUrl: 'https://api.ejemplo.cl',
      cloudBackupEnabled: false,
      cloudBackupRetention: 7,
    });
    for (const mala of ['ftp://x', 'no-es-url', 'https://user:pass@x.cl', 'https://x.cl?q=1']) {
      expect((await editar({ cloudUrl: mala })).json()).toMatchObject({
        error: 'NUBE_URL_INVALIDA',
      });
    }
    expect((await editar({ cloudBackupRetention: 0 })).statusCode).toBe(400);
    expect((await editar({ cloudBackupRetention: 31 })).statusCode).toBe(400);

    await editar({ cloudUrl: null });
    const sinUrl = await editar({ cloudBackupEnabled: true });
    expect(sinUrl.statusCode).toBe(400);
    expect(sinUrl.json()).toMatchObject({ error: 'NUBE_URL_REQUERIDA' });
  });

  it('PROVEEDOR_EXTERNO todavía no se puede elegir', async () => {
    const res = await editar({ dteProvider: 'PROVEEDOR_EXTERNO' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'MODALIDAD_NO_DISPONIBLE' });
  });

  it('en producción no se puede pasar a MOCK', async () => {
    const app = crearApp({ db: c.db, permitirModoPrueba: false });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { usuarioId: c.duenoId, pin: '1234' },
    });
    const headers = { authorization: `Bearer ${login.json<{ token: string }>().token}` };
    await editar({ dteProvider: 'PUENTE_MANUAL' }, headers, app);
    const res = await editar({ dteProvider: 'MOCK' }, headers, app);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'MODO_PRUEBA_NO_PERMITIDO' });
    const conf = await app.inject({ method: 'GET', url: '/settings', headers });
    expect(conf.json()).toMatchObject({ modalidadesDisponibles: ['PUENTE_MANUAL'] });
  });

  it('solo el dueño puede cambiar la configuración; el cajero puede leerla', async () => {
    const cajero = await entrarComo(c, c.cajeroId, '0000');
    expect((await editar({ dteProvider: 'PUENTE_MANUAL' }, cajero)).statusCode).toBe(403);
    const res = await c.app.inject({ method: 'GET', url: '/settings', headers: cajero });
    expect(res.statusCode).toBe(200);
    expect((await c.app.inject({ method: 'GET', url: '/settings' })).statusCode).toBe(401);
  });

  it.each([
    {},
    { dteProvider: 'OTRO' },
    { cashRoundingEnabled: 'si' },
    { comuna: 'x'.repeat(121) },
  ])('valida el cuerpo %j', async (payload) => {
    expect((await editar(payload)).statusCode).toBe(400);
  });
});

describe('etiquetas de balanza con precio', () => {
  it('por defecto todos los prefijos traen peso; el dueño indica cuáles traen precio', async () => {
    const leer = async () =>
      (await c.app.inject({ method: 'GET', url: '/settings', headers: dueno })).json<{
        prefijosBalanzaPrecio: string[];
      }>();
    expect((await leer()).prefijosBalanzaPrecio).toEqual([]);
    const r = await editar({ prefijosBalanzaPrecio: ['27', '26', '27'] });
    expect(r.json()).toMatchObject({ prefijosBalanzaPrecio: ['26', '27'] });
    expect((await editar({ prefijosBalanzaPrecio: ['30'] })).statusCode).toBe(400);
    expect((await editar({ prefijosBalanzaPrecio: [] })).json()).toMatchObject({
      prefijosBalanzaPrecio: [],
    });
  });

  it('el lookup lee la etiqueta según esa configuración', async () => {
    // Queso laminado tiene código de balanza 01234. "2601234 01200 d": $1.200 o 1,200 kg.
    const codigo = '260123401200';
    const d =
      (10 - (Array.from(codigo).reduce((s, ch, i) => s + Number(ch) * (i % 2 ? 3 : 1), 0) % 10)) %
      10;
    const url = `/products/lookup/${codigo}${d}`;
    const peso = await c.app.inject({ method: 'GET', url });
    expect(peso.json()).toMatchObject({ balanza: { tipo: 'PESO', pesoGramos: 1200 } });
    await editar({ prefijosBalanzaPrecio: ['26'] });
    const precio = await c.app.inject({ method: 'GET', url });
    expect(precio.json()).toMatchObject({
      origen: 'LOCAL',
      producto: { name: 'Queso laminado' },
      balanza: { tipo: 'PRECIO', precioClp: 1200 },
    });
  });
});
