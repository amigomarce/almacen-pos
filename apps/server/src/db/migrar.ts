import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client.js';

const CARPETA_POR_DEFECTO = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Aplica las migraciones pendientes. Idempotente.
 *
 * En el instalador la carpeta viaja como recurso y se indica con `ALMACEN_MIGRACIONES`:
 * el bundle de esbuild no conserva la ruta original del repo.
 */
export function migrar(
  db: Db,
  carpeta: string = process.env['ALMACEN_MIGRACIONES']?.trim() || CARPETA_POR_DEFECTO,
): void {
  migrate(db, { migrationsFolder: carpeta });
}
