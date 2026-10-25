import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/** Envuelve un pool de Postgres (real o pg-mem en tests) con el esquema de la nube. */
export function drizzleDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}
