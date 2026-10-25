import { describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { crearVerificadorJwt } from '../auth/supabase.js';
import type { Db } from '../db/client.js';
import { SECRETO_JWT, firmarJwt, productoCloud, repoProductosFalso } from '../test/ayudas.js';

function dbFalsa(): Db {
  return { execute: () => Promise.resolve({ rows: [] }) } as unknown as Db;
}

function crearAppDePrueba() {
  return crearApp({
    db: dbFalsa(),
    repoProductos: repoProductosFalso([
      productoCloud({ id: 'p1', name: 'Bebida cola', priceClp: 1890 }),
      productoCloud({ id: 'p2', name: 'Pan', unit: 'KG', priceClp: 1990 }),
    ]),
    verificarJwt: crearVerificadorJwt(SECRETO_JWT),
  });
}

describe('rutas de productos del dueño', () => {
  it('lista los productos con el JWT del dueño', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const productos =
      res.json<Array<{ id: string; name: string; priceClp: number; ownerId?: string }>>();
    expect(productos).toHaveLength(2);
    expect(productos[0]).toMatchObject({ id: 'p1', name: 'Bebida cola', priceClp: 1890 });
    expect(productos[0]).not.toHaveProperty('ownerId');
  });

  it('filtra por texto', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'GET',
      url: '/products?buscar=Pan',
      headers: { authorization: `Bearer ${token}` },
    });
    const productos = res.json<Array<{ id: string }>>();
    expect(productos).toHaveLength(1);
    expect(productos[0]).toMatchObject({ id: 'p2' });
  });

  it('edita el precio y devuelve el producto público', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'PATCH',
      url: '/products/p1',
      headers: { authorization: `Bearer ${token}` },
      payload: { priceClp: 2000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 'p1', priceClp: 2000 });
    expect(res.json()).not.toHaveProperty('version');
  });

  it('cambio masivo por categoría', async () => {
    const app = crearApp({
      db: dbFalsa(),
      repoProductos: repoProductosFalso([
        productoCloud({ id: 'p1', name: 'A', categoryId: 'c1', priceClp: 1000 }),
        productoCloud({ id: 'p2', name: 'B', categoryId: 'c1', priceClp: 2000 }),
        productoCloud({ id: 'p3', name: 'C', categoryId: 'c2', priceClp: 500 }),
      ]),
      verificarJwt: crearVerificadorJwt(SECRETO_JWT),
    });
    const token = await firmarJwt('dueno-1');
    const res = await app.inject({
      method: 'POST',
      url: '/products/bulk-price',
      headers: { authorization: `Bearer ${token}` },
      payload: { filtro: { categoriaId: 'c1' }, porcentaje: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ cantidad: number }>().cantidad).toBe(2);
  });

  it('rechaza sin JWT válido', async () => {
    const res = await crearAppDePrueba().inject({ method: 'GET', url: '/products' });
    expect(res.statusCode).toBe(401);
  });

  it('devuelve 404 al editar un producto que no existe', async () => {
    const token = await firmarJwt('dueno-1');
    const res = await crearAppDePrueba().inject({
      method: 'PATCH',
      url: '/products/inexistente',
      headers: { authorization: `Bearer ${token}` },
      payload: { priceClp: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});
