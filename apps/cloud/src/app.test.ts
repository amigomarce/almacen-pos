import { describe, expect, it } from 'vitest';
import { crearApp } from './app.js';
import type { Db } from './db/client.js';

function dbFalsa(sana: boolean): Db {
  return {
    execute: () => {
      if (!sana) return Promise.reject(new Error('base caída'));
      return Promise.resolve({ rows: [] });
    },
  } as unknown as Db;
}

describe('GET /health', () => {
  it('responde ok con la base sana', async () => {
    const app = crearApp({ db: dbFalsa(true) });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok', version: '0.1.0' });
  });

  it('responde degradado si la base no responde', async () => {
    const app = crearApp({ db: dbFalsa(false) });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'degradado', db: 'error' });
  });
});
