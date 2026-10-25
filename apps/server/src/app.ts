import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { ConfigBalanza } from '@almacen/core';
import { LICENCIA, TEXTO_ATRIBUCION, URL_LICENCIA } from '@almacen/data';
import pkg from '../package.json' with { type: 'json' };
import type { Db } from './db/client.js';
import { buscarProducto, type DependenciasLookup } from './productos/lookup.js';
import type { Semilla } from './productos/semilla.js';

export interface OpcionesApp {
  db: Db;
  /** Base semilla de productos; `null` o ausente = la caja funciona sin sugerencias. */
  semilla?: Semilla | null;
  /** Consulta en línea a Open Food Facts; `null` o ausente = sin internet. */
  off?: DependenciasLookup['off'];
  configBalanza?: ConfigBalanza;
  logger?: boolean;
}

export function crearApp({
  db,
  semilla = null,
  off = null,
  configBalanza,
  logger = false,
}: OpcionesApp): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/health', () => {
    let estadoDb: 'ok' | 'error' = 'ok';
    try {
      db.get(sql`select 1`);
    } catch {
      estadoDb = 'error';
    }
    return {
      status: estadoDb === 'ok' ? 'ok' : 'degradado',
      version: pkg.version,
      db: estadoDb,
      semilla: semilla !== null,
      hora: new Date().toISOString(),
    };
  });

  /**
   * Para la pantalla "Acerca de" (ADR-004, ODbL §4.3): atribución de los datos de productos.
   * Sale de `seed_meta`; sin semilla se usa el mismo texto, porque la consulta en línea
   * también trae datos de Open Food Facts.
   */
  app.get('/about', () => {
    const meta = semilla?.meta ?? {};
    let sources: unknown;
    try {
      sources = JSON.parse(meta['sources'] ?? '[]');
    } catch {
      sources = [];
    }
    return {
      app: 'Almacén POS',
      version: pkg.version,
      license: meta['license'] ?? LICENCIA,
      license_url: meta['license_url'] ?? URL_LICENCIA,
      attribution: meta['attribution'] ?? TEXTO_ATRIBUCION,
      sources,
      built_at: meta['built_at'] ?? null,
      product_count: meta['product_count'] ? Number(meta['product_count']) : null,
    };
  });

  app.get<{ Params: { barcode: string } }>('/products/lookup/:barcode', async (req, reply) => {
    const r = await buscarProducto(
      { db, semilla, off, ...(configBalanza ? { configBalanza } : {}) },
      req.params.barcode,
    );
    if ('error' in r) return reply.code(400).send(r);
    return r;
  });

  return app;
}
