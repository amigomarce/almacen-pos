import { describe, expect, it } from 'vitest';
import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';

describe('CORS para la ventana de Tauri', () => {
  const app = crearApp({ db: abrirDb(':memory:') });

  it.each(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'])(
    'permite %s',
    async (origin) => {
      const res = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['vary']).toBe('Origin');
    },
  );

  it('responde la consulta previa (preflight) sin pedir sesión', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/sales',
      headers: { origin: 'tauri://localhost', 'access-control-request-method': 'POST' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-headers']).toBe('authorization, content-type');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('no habilita otras páginas web ni pedidos sin origen', async () => {
    const otra = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://ejemplo.cl' },
    });
    expect(otra.headers['access-control-allow-origin']).toBeUndefined();
    const sin = await app.inject({ method: 'GET', url: '/health' });
    expect(sin.headers['access-control-allow-origin']).toBeUndefined();
    const previa = await app.inject({
      method: 'OPTIONS',
      url: '/sales',
      headers: { origin: 'https://ejemplo.cl' },
    });
    expect(previa.statusCode).not.toBe(204);
  });
});
