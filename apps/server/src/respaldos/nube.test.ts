import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirDb, type Db } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { storeSettings } from '../db/schema.js';
import {
  descargarRespaldoNube,
  listarRespaldosNube,
  restaurarDesdeNube,
  subirUltimoRespaldo,
} from './nube.js';
import { crearRespaldo, leerManifiestoRespaldo, listarRespaldos } from './servicio.js';
import { crearPaqueteCifrado } from './paquete.js';
import { leerClaveRespaldo } from './cifrado.js';

const dirs: string[] = [];
const dbs: Db[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'almacen-nube-test-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.$client.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Base {
  db: Db;
  dir: string;
  rutaDb: string;
  rutaClave: string;
  nombres: string[];
}

async function base(opciones: { habilitado?: boolean; url?: string | null } = {}): Promise<Base> {
  const root = tmp();
  const rutaDb = join(root, 'almacen.sqlite');
  const db = abrirDb(rutaDb);
  dbs.push(db);
  migrar(db);
  db.insert(storeSettings)
    .values({
      razonSocial: 'Almacén de Prueba',
      cloudUrl: opciones.url === undefined ? 'https://nube.ejemplo' : opciones.url,
      cloudBackupEnabled: opciones.habilitado ?? true,
      cloudBackupRetention: 2,
    })
    .run();
  const dir = join(root, 'respaldos');
  const claveSii = join(root, 'sii.key');
  writeFileSync(claveSii, Buffer.alloc(32, 7));
  const rutaClave = join(root, 'respaldo.key');
  await crearRespaldo(db, { dir, rutaDb, rutaClaveSii: claveSii });
  return {
    db,
    dir,
    rutaDb,
    rutaClave,
    nombres: listarRespaldos(dir).map((r) => r.nombre),
  };
}

interface Peticion {
  url: string;
  init: RequestInit;
}

function fetchNube(
  respuesta: () => Response = () =>
    new Response(JSON.stringify({ id: 'bk-1', objeto: 'x/y/bk-1.apos' }), { status: 201 }),
): { fn: typeof fetch; peticiones: Peticion[] } {
  const peticiones: Peticion[] = [];
  const fn = ((url: string, init: RequestInit = {}) => {
    peticiones.push({ url, init });
    return Promise.resolve(respuesta());
  }) as typeof fetch;
  return { fn, peticiones };
}

function opciones(b: Base, fetchFn: typeof fetch) {
  return { db: b.db, dir: b.dir, rutaClave: b.rutaClave, rutaDb: b.rutaDb, fetchFn };
}

describe('respaldo cifrado a la nube', () => {
  it('sube el último respaldo con la URL, el hash y la retención', async () => {
    const b = await base();
    const { fn, peticiones } = fetchNube();

    const info = await subirUltimoRespaldo(opciones(b, fn));

    expect(info?.nube?.id).toBe('bk-1');
    expect(peticiones).toHaveLength(1);
    const p = peticiones[0];
    if (!p) throw new Error('sin petición');
    expect(p.url).toContain('https://nube.ejemplo/backups?');
    expect(p.url).toContain('retention=2');
    expect(p.url).toContain('filename=');
    const headers = new Headers(p.init.headers);
    expect(headers.get('authorization')).toMatch(/^Bearer /);
    expect(headers.get('content-type')).toBe('application/octet-stream');
    const datos = p.init.body as Buffer;
    expect(datos.subarray(0, 8).toString()).toBe('APOSBK01');

    const manifiesto = leerManifiestoRespaldo(b.dir, b.nombres[0] ?? '');
    expect(manifiesto.nube?.subidoEn).toBeTruthy();
    expect(manifiesto.nube?.sha256).toHaveLength(64);
  });

  it('no vuelve a subir el mismo respaldo', async () => {
    const b = await base();
    const { fn, peticiones } = fetchNube();
    await subirUltimoRespaldo(opciones(b, fn));
    expect(await subirUltimoRespaldo(opciones(b, fn))).toBeNull();
    expect(peticiones).toHaveLength(1);
  });

  it('respeta el interruptor y la ausencia de URL', async () => {
    const apagado = await base({ habilitado: false });
    const { fn } = fetchNube();
    expect(await subirUltimoRespaldo(opciones(apagado, fn))).toBeNull();

    const sinUrl = await base({ url: null });
    expect(await subirUltimoRespaldo(opciones(sinUrl, fn))).toBeNull();
  });

  it('registra el error y reintenta cuando la nube falla', async () => {
    const b = await base();
    let estado = 500;
    const { fn, peticiones } = fetchNube(() =>
      estado === 200
        ? new Response(JSON.stringify({ id: 'bk-1', objeto: 'x/y/bk-1.apos' }), { status: 201 })
        : new Response('caída', { status: estado }),
    );

    await expect(subirUltimoRespaldo(opciones(b, fn))).rejects.toMatchObject({
      codigo: 'NUBE_RESPALDO_FALLIDO',
    });
    expect(leerManifiestoRespaldo(b.dir, b.nombres[0] ?? '').nube?.error).toBeTruthy();

    estado = 200;
    expect(await subirUltimoRespaldo(opciones(b, fn))).not.toBeNull();
    expect(peticiones).toHaveLength(2);
  });

  it('lista y descarga respaldos de la caja', async () => {
    const b = await base();
    const { fn } = fetchNube(
      () =>
        new Response(
          JSON.stringify({
            respaldos: [
              {
                id: 'bk-1',
                filename: 'a.apos',
                sizeBytes: 3,
                sha256: 'x',
                createdAt: '2026-10-26T00:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const lista = await listarRespaldosNube(b.db, { fetchFn: fn });
    expect(lista).toHaveLength(1);

    const bytes = await descargarRespaldoNube(b.db, 'bk-1', {
      fetchFn: () => Promise.resolve(new Response('abc', { status: 200 })),
    });
    expect(bytes.toString()).toBe('abc');
  });

  it('restaura desde la nube descargando y descifrando', async () => {
    const b = await base();
    const clave = leerClaveRespaldo(b.rutaClave);
    const paquete = await crearPaqueteCifrado(join(b.dir, b.nombres[0] ?? ''), clave);

    // La base de configuración (de dónde sale la URL/token) es distinta de la base destino.
    const configRoot = tmp();
    const configDb = abrirDb(join(configRoot, 'config.sqlite'));
    dbs.push(configDb);
    migrar(configDb);
    configDb.insert(storeSettings).values({ cloudUrl: 'https://nube.ejemplo' }).run();

    const destinoRoot = tmp();
    const rutaDestino = join(destinoRoot, 'almacen.sqlite');
    const destino = abrirDb(rutaDestino);
    migrar(destino);
    destino.insert(storeSettings).values({ razonSocial: 'Destino' }).run();
    destino.$client.close();

    const resultado = await restaurarDesdeNube({
      db: configDb,
      dir: b.dir,
      rutaClave: b.rutaClave,
      rutaDb: rutaDestino,
      id: 'bk-1',
      fetchFn: () => Promise.resolve(new Response(paquete.datos, { status: 200 })),
    });
    expect(resultado.copiaPrevia).not.toBeNull();
    expect(readFileSync(rutaDestino).length).toBeGreaterThan(0);
    const verificada = abrirDb(rutaDestino);
    dbs.push(verificada);
    const fila = verificada.select().from(storeSettings).get();
    expect(fila?.razonSocial).toBe('Almacén de Prueba');
  });
});
