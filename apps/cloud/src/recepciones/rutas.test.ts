import { describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { crearVerificadorJwt } from '../auth/supabase.js';
import type { Db } from '../db/client.js';
import { SECRETO_JWT, firmarJwt, productoCloud, repoRecepcionesFalso } from '../test/ayudas.js';

function dbFalsa(): Db {
  return { execute: () => Promise.resolve({ rows: [] }) } as unknown as Db;
}

function crearAppDePrueba() {
  return crearApp({
    db: dbFalsa(),
    repoRecepciones: repoRecepcionesFalso([productoCloud({ id: 'p1', name: 'Bebida' })], {
      p1: 1000,
    }),
    verificarJwt: crearVerificadorJwt(SECRETO_JWT),
  });
}

describe('rutas de recepción (móvil)', () => {
  it('registra una recepción con el JWT del dueño', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'POST',
      url: '/receptions',
      headers: { authorization: `Bearer ${token}` },
      payload: { lineas: [{ productId: 'p1', cantidadMilli: 2000 }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ lineas: [{ productId: 'p1', stockNuevoMilli: 3000 }] });
  });

  it('rechaza sin JWT válido', async () => {
    const res = await crearAppDePrueba().inject({
      method: 'POST',
      url: '/receptions',
      payload: { lineas: [{ productId: 'p1', cantidadMilli: 1 }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('devuelve 404 si el producto no existe', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'POST',
      url: '/receptions',
      headers: { authorization: `Bearer ${token}` },
      payload: { lineas: [{ productId: 'x', cantidadMilli: 1 }] },
    });
    expect(res.statusCode).toBe(404);
  });
});
