import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Abre (o crea) la base local. Usa `:memory:` para tests. */
export function abrirDb(ruta: string): Db {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const sqlite = new Database(ruta);
  sqlite.pragma('journal_mode = WAL'); // lectura concurrente mientras la caja escribe
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}
