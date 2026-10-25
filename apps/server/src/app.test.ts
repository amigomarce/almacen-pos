import { describe, expect, it } from 'vitest';
import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';

describe('GET /health', () => {
  const db = abrirDb(':memory:');
  const app = crearApp({ db });

  it('responde ok con la base disponible', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok', version: '0.1.0' });
  });

  it('informa degradado si la base no responde', async () => {
    const cerrada = abrirDb(':memory:');
    cerrada.$client.close();
    const res = await crearApp({ db: cerrada }).inject({ method: 'GET', url: '/health' });
    expect(res.json()).toMatchObject({ status: 'degradado', db: 'error' });
  });
});
