import { Pool } from 'pg';
import { crearApp } from './app.js';
import { crearVerificadorJwt } from './auth/supabase.js';
import { drizzleDb } from './db/client.js';
import { migrar } from './db/migrar.js';
import { RUTA_ENV, cargarEnvLocal, variable } from './env.js';

const conEnv = cargarEnvLocal();

const puerto = Number(variable('PORT') ?? 3002);
const host = variable('HOST') ?? '127.0.0.1';
const connectionString = variable('CLOUD_DATABASE_URL');

if (!connectionString) {
  console.error(
    'Falta CLOUD_DATABASE_URL (URL de la base de Supabase/Postgres). Copia .env.example y complétala.',
  );
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzleDb(pool);
await migrar(db);

// Sin SUPABASE_JWT_SECRET los endpoints del dueño responden 401 (no se puede validar su JWT).
const secretoJwt = variable('SUPABASE_JWT_SECRET');
const app = crearApp({
  db,
  ...(secretoJwt ? { verificarJwt: crearVerificadorJwt(secretoJwt) } : {}),
  logger: true,
});

if (conEnv) app.log.info(`Variables cargadas de ${RUTA_ENV}`);
if (!secretoJwt)
  app.log.warn('SUPABASE_JWT_SECRET sin definir: el login del dueño queda deshabilitado.');

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
