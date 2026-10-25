import type { ProductoWire } from '@almacen/sync';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { productoAWire } from './mapping.js';
import { aplicarEventos } from './aplicar.js';
import { prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;

const aguas = () =>
  c.db.select().from(t.products).where(eq(t.products.name, 'Agua mineral 500 ml')).get();

const wire = (sobre: Partial<ProductoWire> & { id: string }): ProductoWire => {
  const base = aguas();
  if (!base) throw new Error('seed de test incompleta');
  return { ...productoAWire(base), ...sobre };
};

beforeEach(() => {
  c = prepararApp();
});

describe('aplicarEventos (pull)', () => {
  it('aplica un cambio de precio con versión mayor y lo audita', () => {
    const p = aguas();
    if (!p) throw new Error('sin producto');
    aplicarEventos(c.db, [
      {
        entity: 'products',
        entityId: p.id,
        op: 'UPDATE',
        payload: wire({ id: p.id, priceClp: 999, version: p.version + 1 }),
      },
    ]);
    const actualizado = aguas();
    expect(actualizado?.priceClp).toBe(999);
    expect(actualizado?.version).toBe(p.version + 1);
    const historial = c.db
      .select()
      .from(t.priceHistory)
      .where(eq(t.priceHistory.productId, p.id))
      .all();
    expect(historial.some((h) => h.newPrice === 999 && h.device === 'nube')).toBe(true);
  });

  it('no aplica si la versión no es mayor', () => {
    const p = aguas();
    if (!p) throw new Error('sin producto');
    aplicarEventos(c.db, [
      {
        entity: 'products',
        entityId: p.id,
        op: 'UPDATE',
        payload: wire({ id: p.id, priceClp: 999, version: p.version }),
      },
    ]);
    expect(aguas()?.priceClp).toBe(p.priceClp);
  });

  it('nunca toca el stock local', () => {
    const p = aguas();
    if (!p) throw new Error('sin producto');
    aplicarEventos(c.db, [
      {
        entity: 'products',
        entityId: p.id,
        op: 'UPDATE',
        payload: wire({ id: p.id, priceClp: 999, version: p.version + 1 }),
      },
    ]);
    expect(aguas()?.stockQtyMilli).toBe(p.stockQtyMilli);
  });

  it('inserta un producto que no existe localmente, sin stock', () => {
    aplicarEventos(c.db, [
      {
        entity: 'products',
        entityId: 'nuevo-1',
        op: 'INSERT',
        payload: wire({
          id: 'nuevo-1',
          name: 'Producto de la nube',
          priceClp: 500,
          barcode: null,
          scaleCode: null,
        }),
      },
    ]);
    const nuevo = c.db.select().from(t.products).where(eq(t.products.id, 'nuevo-1')).get();
    expect(nuevo?.name).toBe('Producto de la nube');
    expect(nuevo?.stockQtyMilli).toBe(0);
  });

  it('DELETE borra suave', () => {
    const p = aguas();
    if (!p) throw new Error('sin producto');
    aplicarEventos(c.db, [{ entity: 'products', entityId: p.id, op: 'DELETE', payload: {} }]);
    expect(aguas()?.deletedAt).not.toBeNull();
  });
});
