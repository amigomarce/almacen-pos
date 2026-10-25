import type { EventoSync } from '@almacen/sync';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { sincronizar } from './cliente.js';
import { obtenerIdentidad } from './identidad.js';
import { prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;

interface Llamada {
  url: string;
  method: string;
}

function fetchFalsa(pullEventos: EventoSync[] = []) {
  const llamadas: Llamada[] = [];
  const fn = ((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    llamadas.push({ url, method });
    if (url.endsWith('/sync/push')) return Promise.resolve(new Response(null, { status: 204 }));
    if (url.endsWith('/sync/pull')) {
      return Promise.resolve(
        new Response(JSON.stringify({ eventos: pullEventos }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/sync/ack')) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(null, { status: 404 }));
  }) as typeof fetch;
  return { fn, llamadas };
}

beforeEach(() => {
  c = prepararApp();
});

describe('sincronizar', () => {
  it('sube los eventos pendientes y los marca como sincronizados', async () => {
    const identidad = obtenerIdentidad(c.db);
    const prod = c.db
      .select()
      .from(t.products)
      .where(eq(t.products.name, 'Agua mineral 500 ml'))
      .get();
    if (!prod) throw new Error('sin producto');
    c.db
      .insert(t.outbox)
      .values({ entity: 'products', entityId: prod.id, op: 'UPDATE', payload: { priceClp: 999 } })
      .run();

    const { fn, llamadas } = fetchFalsa();
    const r = await sincronizar(c.db, {
      cloudUrl: 'http://nube.test/',
      deviceToken: identidad.deviceToken,
      fetchFn: fn,
    });

    expect(r.subidos).toBe(1);
    expect(llamadas.some((l) => l.url === 'http://nube.test/sync/push')).toBe(true);
    const pendientes = c.db.select().from(t.outbox).all();
    expect(pendientes[0]?.syncedAt).not.toBeNull();
  });

  it('baja y aplica los cambios del dueño y los confirma', async () => {
    const identidad = obtenerIdentidad(c.db);
    const prod = c.db
      .select()
      .from(t.products)
      .where(eq(t.products.name, 'Agua mineral 500 ml'))
      .get();
    if (!prod) throw new Error('sin producto');
    const { fn, llamadas } = fetchFalsa([
      {
        entity: 'products',
        entityId: prod.id,
        op: 'UPDATE',
        payload: {
          id: prod.id,
          barcode: prod.barcode,
          name: prod.name,
          brand: prod.brand,
          format: prod.format,
          unit: prod.unit,
          categoryId: prod.categoryId,
          priceClp: 1234,
          costClp: prod.costClp,
          taxType: prod.taxType,
          extraTaxCode: prod.extraTaxCode,
          stockMinMilli: prod.stockMinMilli,
          active: prod.active,
          source: prod.source,
          seedRef: prod.seedRef,
          scaleCode: prod.scaleCode,
          createdAt: prod.createdAt.toISOString(),
          updatedAt: prod.updatedAt.toISOString(),
          version: prod.version + 1,
          deletedAt: null,
        },
      },
    ]);

    const r = await sincronizar(c.db, {
      cloudUrl: 'http://nube.test',
      deviceToken: identidad.deviceToken,
      fetchFn: fn,
    });

    expect(r.bajados).toBe(1);
    expect(c.db.select().from(t.products).where(eq(t.products.id, prod.id)).get()?.priceClp).toBe(
      1234,
    );
    expect(llamadas.some((l) => l.url === 'http://nube.test/sync/ack')).toBe(true);
  });
});
