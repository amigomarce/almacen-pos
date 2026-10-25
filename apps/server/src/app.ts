import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { ConfigBalanza } from '@almacen/core';
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
