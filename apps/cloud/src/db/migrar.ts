import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

// En el contenedor el código va compilado en un solo archivo: la carpeta viene por variable.
const CARPETA_MIGRACIONES =
  process.env['CLOUD_MIGRACIONES'] ?? fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Aplica las migraciones pendientes. Idempotente. */
export async function migrar(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
}
