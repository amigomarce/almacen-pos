import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { hashToken } from '../auth/dispositivos.js';
import type { Db } from '../db/client.js';
import { instalacion, repoFalso } from '../test/ayudas.js';
import type { AlmacenObjetos } from './almacen.js';
import { sha256De, type RepoRespaldos, type RespaldoCloud } from './servicio.js';

const TOKEN = 'token-de-caja';
const FECHA = '2026-10-26T03:00:00.000Z';

function respaldoFalso(): { repo: RepoRespaldos; filas: RespaldoCloud[] } {
  const filas: RespaldoCloud[] = [];
  const repo: RepoRespaldos = {
    guardar(datos) {
      const fila: RespaldoCloud = {
        ...datos,
        createdAt: datos.createdAt,
      };
      filas.push(fila);
      return Promise.resolve(fila);
    },
    listar(ownerId, installationId, limite = 50) {
      return Promise.resolve(
        filas
          .filter((f) => f.ownerId === ownerId && f.installationId === installationId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limite),
      );
    },
    porId(ownerId, installationId, id) {
      return Promise.resolve(
        filas.find(
          (f) => f.ownerId === ownerId && f.installationId === installationId && f.id === id,
        ) ?? null,
      );
    },
    antiguos(ownerId, installationId, conservar) {
      return Promise.resolve(
        filas
          .filter((f) => f.ownerId === ownerId && f.installationId === installationId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(conservar),
      );
    },
    eliminar(id) {
      const i = filas.findIndex((f) => f.id === id);
      if (i >= 0) filas.splice(i, 1);
      return Promise.resolve();
    },
  };
  return { repo, filas };
}

function almacenFalso(): { almacen: AlmacenObjetos; objetos: Map<string, Buffer> } {
  const objetos = new Map<string, Buffer>();
  return {
    objetos,
    almacen: {
      subir(ruta, datos) {
        objetos.set(ruta, Buffer.from(datos));
        return Promise.resolve();
      },
      descargar(ruta) {
        const datos = objetos.get(ruta);
        if (!datos) return Promise.reject(new Error('no existe'));
        return Promise.resolve(datos);
      },
      eliminar(ruta) {
        objetos.delete(ruta);
        return Promise.resolve();
      },
    },
  };
}

function appCon(extras: { ownerId?: string | null; almacen?: AlmacenObjetos | null } = {}) {
  const instalaciones = repoFalso([
    instalacion({
      id: 'inst-1',
      name: 'Caja 1',
      tokenHash: hashToken(TOKEN),
      ownerId: extras.ownerId === undefined ? 'dueno-1' : extras.ownerId,
    }),
  ]);
  const { repo, filas } = respaldoFalso();
  const { almacen, objetos } = almacenFalso();
  const app = crearApp({
    db: {} as Db,
    repoInstalaciones: instalaciones,
    repoRespaldos: repo,
    almacenObjetos: extras.almacen === undefined ? almacen : extras.almacen,
    maxRespaldoBytes: 1024,
  });
  return { app, filas, objetos };
}

const auth = { authorization: `Bearer ${TOKEN}` };

function subir(
  app: ReturnType<typeof crearApp>,
  datos: Buffer,
  extras: { filename?: string; sha256?: string; retention?: number } = {},
) {
  const params = new URLSearchParams({
    filename: extras.filename ?? 'almacen-2026-10-26_00-00-00.apos',
    sha256: extras.sha256 ?? sha256De(datos),
    createdAt: FECHA,
    retention: String(extras.retention ?? 7),
  });
  return app.inject({
    method: 'POST',
    url: `/backups?${params.toString()}`,
    headers: { ...auth, 'content-type': 'application/octet-stream' },
    payload: datos,
  });
}

describe('API de respaldos de la nube', () => {
  it('sube, lista y descarga el paquete cifrado', async () => {
    const { app, filas, objetos } = appCon();
    const datos = Buffer.from('paquete-cifrado');

    const res = await subir(app, datos);
    expect(res.statusCode).toBe(201);
    const creado = res.json<{ id: string; objeto: string }>();
    expect(filas).toHaveLength(1);
    expect(objetos.get(creado.objeto)?.toString()).toBe('paquete-cifrado');

    const lista = await app.inject({ method: 'GET', url: '/backups/caja', headers: auth });
    expect(lista.json<{ respaldos: { id: string }[] }>().respaldos).toHaveLength(1);

    const descarga = await app.inject({
      method: 'GET',
      url: `/backups/caja/${creado.id}`,
      headers: auth,
    });
    expect(descarga.statusCode).toBe(200);
    expect(descarga.body).toBe('paquete-cifrado');
    expect(descarga.headers['content-disposition']).toContain('almacen-');
  });

  it('rechaza un hash que no coincide y un paquete demasiado grande', async () => {
    const { app } = appCon();
    const datos = Buffer.from('x');
    expect((await subir(app, datos, { sha256: '0'.repeat(64) })).statusCode).toBe(400);

    const grande = Buffer.alloc(1025, 1);
    expect((await subir(app, grande)).statusCode).toBe(413);
  });

  it('podan los respaldos que sobran de la retención', async () => {
    const { app, filas, objetos } = appCon();
    for (let i = 0; i < 3; i += 1) {
      const res = await subir(app, Buffer.from(`r${i}`), { retention: 2 });
      expect(res.statusCode).toBe(201);
    }
    expect(filas).toHaveLength(2);
    expect(objetos.size).toBe(2);
  });

  it('exige caja vinculada, token válido y Storage configurado', async () => {
    const sinDueno = appCon({ ownerId: null });
    expect((await subir(sinDueno.app, Buffer.from('x'))).statusCode).toBe(409);

    const { app } = appCon();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/backups/caja',
          headers: { authorization: 'Bearer nope' },
        })
      ).statusCode,
    ).toBe(401);

    const sinStorage = appCon({ almacen: null });
    const res = await subir(sinStorage.app, Buffer.from('x'));
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'RESPALDOS_NO_CONFIGURADOS' });
  });

  it('no descarga un respaldo de otra caja', async () => {
    const { app, filas } = appCon();
    const datos = Buffer.from('x');
    const res = await subir(app, datos);
    const id = res.json<{ id: string }>().id;
    const fila = filas[0];
    if (!fila) throw new Error('sin fila');
    fila.installationId = 'otra-caja';

    const descarga = await app.inject({
      method: 'GET',
      url: `/backups/caja/${id}`,
      headers: auth,
    });
    expect(descarga.statusCode).toBe(404);
  });
});

describe('sha256De', () => {
  it('calcula el hash esperado', () => {
    expect(sha256De(Buffer.from('x'))).toBe(createHash('sha256').update('x').digest('hex'));
  });
});
