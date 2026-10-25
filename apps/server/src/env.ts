/**
 * Variables de entorno locales: carga `<repo>/.env` si existe (plantilla en `.env.example`).
 * El `.env` está en `.gitignore`: ahí va el contacto para Open Food Facts, que no se commitea.
 * Las variables que ya vienen del entorno ganan (igual que `node --env-file`), así que
 * `ALMACEN_CONTACTO=... pnpm dev:server` sirve para una sola ejecución.
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
