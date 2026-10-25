import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import pkg from '../package.json' with { type: 'json' };
import type { Db } from './db/client.js';

export interface OpcionesApp {
  db: Db;
  logger?: boolean;
}

export function crearApp({ db, logger = false }: OpcionesApp): FastifyInstance {
  const app = Fastify({ logger });

  // Público: lo consulta el dueño (móvil) y la caja para saber que la nube responde.
  app.get('/health', async () => {
    let estadoDb: 'ok' | 'error' = 'ok';
    try {
      await db.execute(sql`select 1`);
    } catch {
      estadoDb = 'error';
    }
    return {
      status: estadoDb === 'ok' ? 'ok' : 'degradado',
      version: pkg.version,
      db: estadoDb,
      hora: new Date().toISOString(),
    };
  });

  return app;
}
