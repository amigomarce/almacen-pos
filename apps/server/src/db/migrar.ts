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
  // Algunas migraciones reconstruyen tablas (SQLite no altera CHECK): `DROP TABLE` de una tabla
  // referenciada falla con las claves foráneas activas, y `PRAGMA foreign_keys` no tiene efecto
  // dentro de la transacción de la migración. Se apagan antes, se verifica la integridad al
  // final y se vuelven a encender.
  const sqlite = db.$client;
  const activas = sqlite.pragma('foreign_keys', { simple: true }) === 1;
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: carpeta });
    const rotas = sqlite.pragma('foreign_key_check') as unknown[];
    if (rotas.length > 0) {
      throw new Error(`La migración dejó ${String(rotas.length)} referencias rotas`);
    }
  } finally {
    if (activas) sqlite.pragma('foreign_keys = ON');
  }
}
