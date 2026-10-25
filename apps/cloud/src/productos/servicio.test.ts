import { describe, expect, it } from 'vitest';
import { editarProducto } from './servicio.js';
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
