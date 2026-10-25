import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Aplica las migraciones pendientes. Idempotente. */
export async function migrar(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
}
