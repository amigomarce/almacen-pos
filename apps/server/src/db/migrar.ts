import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client.js';

const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Aplica las migraciones pendientes. Idempotente. */
export function migrar(db: Db): void {
  migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
}
