/**
 * Variables de entorno de la nube (apps/cloud). La URL de la base de Supabase/Postgres se
 * lee de `CLOUD_DATABASE_URL` (o de `<repo>/.env`); ahí va la clave de conexión, que no se
 * commitea. Las variables del entorno ganan sobre las del archivo.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUTA_ENV = fileURLToPath(new URL('../../../.env', import.meta.url));

/** Carga el archivo si existe. Devuelve `true` si lo cargó. */
export function cargarEnvLocal(ruta: string = RUTA_ENV): boolean {
  if (!existsSync(ruta)) return false;
  process.loadEnvFile(ruta);
  return true;
}

/** Valor de una variable; vacía o con solo espacios cuenta como no definida. */
export function variable(nombre: string): string | undefined {
  const v = process.env[nombre]?.trim();
  return v === '' ? undefined : v;
}
