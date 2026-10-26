import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app.js';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { sembrar } from '../db/seed.js';
import { storeSettings, users } from '../db/schema.js';
import { entrarComo, type CtxPrueba } from '../test/sesion.js';

const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'almacen-rutas-respaldos-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function appConRespaldos(
  opciones: {
    cloudUrl?: string;
    fetchFn?: typeof fetch;
    subirNube?: () => Promise<unknown>;
  } = {},
) {
  const db = abrirDb(':memory:');
  migrar(db);
  sembrar(db);
  if (opciones.cloudUrl) {
    db.update(storeSettings).set({ cloudUrl: opciones.cloudUrl }).run();
  }
  const dir = join(tmp(), 'respaldos');
  const app = crearApp({
    db,
    respaldos: {
      dir,
      rutaDb: join(tmp(), 'almacen.sqlite'),
      rutaClaveRespaldo: join(tmp(), 'respaldo.key'),
      ...(opciones.fetchFn ? { fetchFn: opciones.fetchFn } : {}),
      ...(opciones.subirNube ? { subirNube: opciones.subirNube } : {}),
    },
  });
  const duenoId = db.select().from(users).where(eq(users.role, 'DUENO')).get()?.id ?? '';
  const cajeroId = db.select().from(users).where(eq(users.role, 'CAJERO')).get()?.id ?? '';
  const c: CtxPrueba = { db, app, reloj: { t: Date.now() }, duenoId, cajeroId };
  return { c, dir };
}

describe('API de respaldos', () => {
  it('el dueño lista y crea un respaldo', async () => {
    const { c, dir } = appConRespaldos();
    const dueno = await entrarComo(c, c.duenoId, '1234');

    const vacio = await c.app.inject({ method: 'GET', url: '/backups', headers: dueno });
    expect(vacio.statusCode).toBe(200);
    expect(vacio.json()).toEqual({ respaldos: [] });

    const creado = await c.app.inject({ method: 'POST', url: '/backups', headers: dueno });
    expect(creado.statusCode).toBe(200);
    const info = creado.json<{ nombre: string; incluyeClaveSii: boolean }>();
    expect(info.nombre).toMatch(/^almacen-/);
    expect(info.incluyeClaveSii).toBe(false);

    const lista = await c.app.inject({ method: 'GET', url: '/backups', headers: dueno });
    expect(lista.json<{ respaldos: { nombre: string }[] }>().respaldos).toHaveLength(1);
    expect(dir).toContain('respaldos');
  });

  it('solo el dueño puede ver o crear respaldos', async () => {
    const { c } = appConRespaldos();
    const cajero = await entrarComo(c, c.cajeroId, '0000');
    expect(
      (await c.app.inject({ method: 'GET', url: '/backups', headers: cajero })).statusCode,
    ).toBe(403);
    expect(
      (await c.app.inject({ method: 'POST', url: '/backups', headers: cajero })).statusCode,
    ).toBe(403);
    expect((await c.app.inject({ method: 'GET', url: '/backups' })).statusCode).toBe(401);
  });

  it('entrega la clave de respaldo solo al dueño', async () => {
    const { c } = appConRespaldos();
    const dueno = await entrarComo(c, c.duenoId, '1234');
    const cajero = await entrarComo(c, c.cajeroId, '0000');
    const res = await c.app.inject({ method: 'GET', url: '/backups/clave', headers: dueno });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json<{ clave: string }>().clave.length).toBeGreaterThan(30);
    expect(
      (await c.app.inject({ method: 'GET', url: '/backups/clave', headers: cajero })).statusCode,
    ).toBe(403);
  });

  it('prueba la conexión con la URL guardada', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), { status: 200 }),
      ),
    );
    const { c } = appConRespaldos({ cloudUrl: 'https://nube.test', fetchFn });
    const dueno = await entrarComo(c, c.duenoId, '1234');
    const res = await c.app.inject({ method: 'POST', url: '/backups/probar-nube', headers: dueno });
    expect(res.json()).toEqual({ ok: true, status: 200, version: '0.1.0' });
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://nube.test/health');

    const caida = appConRespaldos({
      cloudUrl: 'https://nube.test',
      fetchFn: () => Promise.reject(new Error('sin red')),
    });
    const d2 = await entrarComo(caida.c, caida.c.duenoId, '1234');
    expect(
      (
        await caida.c.app.inject({ method: 'POST', url: '/backups/probar-nube', headers: d2 })
      ).json(),
    ).toEqual({ ok: false, status: 0, version: null });
  });

  it('dispara la subida a la nube al crear un respaldo manual', async () => {
    const subirNube = vi.fn(() => Promise.resolve());
    const { c } = appConRespaldos({ subirNube });
    const dueno = await entrarComo(c, c.duenoId, '1234');
    await c.app.inject({ method: 'POST', url: '/backups', headers: dueno });
    expect(subirNube).toHaveBeenCalledOnce();
  });

  it('si la app no configura respaldos, la ruta no existe', async () => {
    const db = abrirDb(':memory:');
    migrar(db);
    const app = crearApp({ db });
    expect((await app.inject({ method: 'GET', url: '/backups' })).statusCode).toBe(404);
  });
});
