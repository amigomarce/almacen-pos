import { describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { hashToken } from '../auth/dispositivos.js';
import type { Db } from '../db/client.js';
import { instalacion, repoFalso, repoSyncFalso } from '../test/ayudas.js';
import type { EventoSaliente } from './servicio.js';

const ISO = '2026-10-25T12:00:00.000Z';
const deviceToken = 'token-de-la-caja-123456';

function dbFalsa(): Db {
  return { execute: () => Promise.resolve({ rows: [] }) } as unknown as Db;
}

function instalacionesVinculadas(ownerId: string | null = 'dueno-1') {
  return repoFalso([
    instalacion({ id: 'inst-1', tokenHash: hashToken(deviceToken), ownerId, linkedAt: new Date() }),
  ]);
}

const eventoProducto = {
  entity: 'products',
  op: 'INSERT',
  entityId: 'p1',
  payload: {
    id: 'p1',
    barcode: null,
    name: 'Pan',
    brand: null,
    format: null,
    unit: 'KG',
    categoryId: null,
    priceClp: 1990,
    costClp: null,
    taxType: 'AFECTO',
    extraTaxCode: null,
    stockMinMilli: null,
    active: true,
    source: 'LOCAL',
    seedRef: null,
    scaleCode: null,
    createdAt: ISO,
    updatedAt: ISO,
    version: 1,
    deletedAt: null,
  },
};

describe('rutas de sincronización', () => {
  it('push: ingesta eventos con token de dispositivo válido', async () => {
    const repoSync = repoSyncFalso();
    const app = crearApp({
      db: dbFalsa(),
      repoInstalaciones: instalacionesVinculadas(),
      repoSync,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { events: [eventoProducto] },
    });
    expect(res.statusCode).toBe(204);
    expect(repoSync.productos).toHaveLength(1);
    expect(repoSync.productos[0]).toMatchObject({ id: 'p1', ownerId: 'dueno-1' });
  });

  it('push: rechaza una caja no vinculada', async () => {
    const app = crearApp({
      db: dbFalsa(),
      repoInstalaciones: instalacionesVinculadas(null),
      repoSync: repoSyncFalso(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'SIN_VINCULAR' });
  });

  it('push: rechaza un dispositivo desconocido', async () => {
    const app = crearApp({
      db: dbFalsa(),
      repoInstalaciones: instalacionesVinculadas(),
      repoSync: repoSyncFalso(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: 'Bearer desconocido-123' },
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('pull: devuelve los eventos pendientes del dueño', async () => {
    const pendientes: EventoSaliente[] = [
      { id: 'e1', entity: 'products', entityId: 'p1', op: 'UPDATE', payload: { priceClp: 1500 } },
    ];
    const app = crearApp({
      db: dbFalsa(),
      repoInstalaciones: instalacionesVinculadas(),
      repoSync: repoSyncFalso(pendientes),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/sync/pull',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ eventos: pendientes });
  });

  it('ack: marca los eventos como sincronizados', async () => {
    const repoSync = repoSyncFalso();
    const app = crearApp({
      db: dbFalsa(),
      repoInstalaciones: instalacionesVinculadas(),
      repoSync,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sync/ack',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { ids: ['e1', 'e2'] },
    });
    expect(res.statusCode).toBe(204);
    expect(repoSync.sincronizados).toEqual(['e1', 'e2']);
  });
});
