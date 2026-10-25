import { Pool } from 'pg';
import { crearApp } from './app.js';
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

const app = crearApp({ db, logger: true });
if (conEnv) app.log.info(`Variables cargadas de ${RUTA_ENV}`);

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
