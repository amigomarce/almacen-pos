import { describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { crearVerificadorJwt } from '../auth/supabase.js';
import type { Db } from '../db/client.js';
import { SECRETO_JWT, firmarJwt, repoFalso } from '../test/ayudas.js';

function dbFalsa(): Db {
  return { execute: () => Promise.resolve({ rows: [] }) } as unknown as Db;
}

function crearAppDePrueba() {
  return crearApp({
    db: dbFalsa(),
    repoInstalaciones: repoFalso(),
    verificarJwt: crearVerificadorJwt(SECRETO_JWT),
  });
}

const payload = {
  installationId: 'inst-1',
  deviceToken: 'token-de-la-caja-123456',
  name: 'Caja 1',
};

describe('rutas de instalaciones', () => {
  it('vincula una caja nueva con el JWT del dueño', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'POST',
      url: '/installations/link',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'inst-1', name: 'Caja 1', ownerId: 'dueno-1' });
  });

  it('rechaza vincular sin JWT válido', async () => {
    const res = await crearAppDePrueba().inject({
      method: 'POST',
      url: '/installations/link',
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'NO_AUTENTICADO' });
  });

  it('rechaza vincular una caja ya vinculada a otra cuenta', async () => {
    const app = crearAppDePrueba();
    await app.inject({
      method: 'POST',
      url: '/installations/link',
      headers: { authorization: `Bearer ${await firmarJwt('dueno-1')}` },
      payload,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/installations/link',
      headers: { authorization: `Bearer ${await firmarJwt('dueno-2')}` },
      payload: { ...payload, deviceToken: 'otro-token-de-la-caja-789' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'YA_VINCULADA' });
  });

  it('la caja consulta su estado con su token de dispositivo', async () => {
    const app = crearAppDePrueba();
    await app.inject({
      method: 'POST',
      url: '/installations/link',
      headers: { authorization: `Bearer ${await firmarJwt('dueno-1')}` },
      payload,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/installations/me',
      headers: { authorization: `Bearer ${payload.deviceToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 'inst-1', ownerId: 'dueno-1' });
  });

  it('rechaza un dispositivo desconocido', async () => {
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/installations/me',
      headers: { authorization: 'Bearer token-desconocido-123' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'DISPOSITIVO_DESCONOCIDO' });
  });
});
