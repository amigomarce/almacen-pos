import { describe, expect, it } from 'vitest';
import { cambioMasivoPrecio, editarProducto } from './servicio.js';
import { productoCloud, repoProductosFalso } from '../test/ayudas.js';

describe('editarProducto (dueño)', () => {
  it('sube la versión, cambia el precio y encola el evento', async () => {
    const repo = repoProductosFalso([productoCloud({ id: 'p1', priceClp: 1000, version: 3 })]);
    const r = await editarProducto(repo, {
      ownerId: 'dueno-1',
      id: 'p1',
      cambios: { priceClp: 1500 },
      ahora: new Date('2026-10-25T12:00:00Z'),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('debía editar');
    expect(r.producto).toMatchObject({ priceClp: 1500, version: 4 });
    expect(repo.encolados).toHaveLength(1);
    expect(repo.encolados[0]).toMatchObject({ entityId: 'p1', op: 'UPDATE' });
  });

  it('rechaza un producto que no existe (o es de otro dueño)', async () => {
    const repo = repoProductosFalso([productoCloud({ id: 'p1', ownerId: 'otro' })]);
    const r = await editarProducto(repo, {
      ownerId: 'dueno-1',
      id: 'p1',
      cambios: { priceClp: 1 },
      ahora: new Date(),
    });
    expect(r).toEqual({ ok: false, error: 'NO_ENCONTRADO' });
  });

  it('rechaza un precio inválido', async () => {
    const repo = repoProductosFalso([productoCloud({ id: 'p1' })]);
    const r = await editarProducto(repo, {
      ownerId: 'dueno-1',
      id: 'p1',
      cambios: { priceClp: 0 },
      ahora: new Date(),
    });
    expect(r).toEqual({ ok: false, error: 'PRECIO_INVALIDO' });
  });
});

describe('cambioMasivoPrecio', () => {
  it('sube el precio por marca y encola cada producto afectado', async () => {
    const repo = repoProductosFalso([
      productoCloud({ id: 'p1', brand: 'Marca A', priceClp: 1000 }),
      productoCloud({ id: 'p2', brand: 'Marca A', priceClp: 2000 }),
      productoCloud({ id: 'p3', brand: 'Marca B', priceClp: 500 }),
    ]);
    const r = await cambioMasivoPrecio(repo, {
      ownerId: 'dueno-1',
      filtro: { marca: 'Marca A' },
      porcentaje: 10,
      ahora: new Date(),
    });
    expect(r.cantidad).toBe(2);
    expect(repo.filas.find((f) => f.id === 'p1')?.priceClp).toBe(1100);
    expect(repo.filas.find((f) => f.id === 'p2')?.priceClp).toBe(2200);
    expect(repo.filas.find((f) => f.id === 'p3')?.priceClp).toBe(500);
    expect(repo.encolados).toHaveLength(2);
  });

  it('admite porcentajes negativos y nunca deja el precio bajo $1', async () => {
    const repo = repoProductosFalso([productoCloud({ id: 'p1', categoryId: 'c1', priceClp: 10 })]);
    await cambioMasivoPrecio(repo, {
      ownerId: 'dueno-1',
      filtro: { categoriaId: 'c1' },
      porcentaje: -90,
      ahora: new Date(),
    });
    expect(repo.filas.find((f) => f.id === 'p1')?.priceClp).toBe(1);
  });
});
