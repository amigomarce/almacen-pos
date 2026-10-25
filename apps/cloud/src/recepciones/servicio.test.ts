import { describe, expect, it } from 'vitest';
import { registrarRecepcion } from './servicio.js';
import { productoCloud, repoRecepcionesFalso } from '../test/ayudas.js';

const ahora = new Date('2026-10-25T12:00:00Z');

describe('registrarRecepcion (móvil)', () => {
  it('suma stock y encola el movimiento sin tocar el costo si no viene', async () => {
    const repo = repoRecepcionesFalso([productoCloud({ id: 'p1', costClp: 1000 })], { p1: 5000 });
    const r = await registrarRecepcion(repo, {
      ownerId: 'dueno-1',
      lineas: [{ productId: 'p1', cantidadMilli: 3000 }],
      ahora,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('debía recibir');
    expect(r.resultado.lineas[0]).toMatchObject({
      stockAnteriorMilli: 5000,
      stockNuevoMilli: 8000,
      costoNuevoClp: 1000,
    });
    expect(repo.guardados).toHaveLength(1);
    expect(repo.guardados[0]?.movimiento).toMatchObject({
      productId: 'p1',
      qtyMilli: 3000,
      type: 'RECEPCION',
    });
    expect(repo.guardados[0]?.producto).toBeUndefined();
  });

  it('con costo recalcula el costo promedio y actualiza el producto', async () => {
    const repo = repoRecepcionesFalso([productoCloud({ id: 'p1', costClp: 1000 })], { p1: 5000 });
    await registrarRecepcion(repo, {
      ownerId: 'dueno-1',
      lineas: [{ productId: 'p1', cantidadMilli: 3000, costoUnitarioClp: 2000 }],
      ahora,
    });
    // (5000×1000 + 3000×2000) / 8000 = 1375
    expect(repo.guardados[0]?.producto?.costClp).toBe(1375);
  });

  it('falla si el producto no existe', async () => {
    const repo = repoRecepcionesFalso();
    const r = await registrarRecepcion(repo, {
      ownerId: 'dueno-1',
      lineas: [{ productId: 'x', cantidadMilli: 1000 }],
      ahora,
    });
    expect(r).toEqual({ ok: false, error: 'PRODUCTO_NO_ENCONTRADO', productId: 'x' });
  });
});
