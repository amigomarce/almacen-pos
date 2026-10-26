import { Pool } from 'pg';
import { crearApp } from './app.js';
import { crearVerificadorJwt } from './auth/supabase.js';
import { drizzleDb } from './db/client.js';
import { migrar } from './db/migrar.js';
import { RUTA_ENV, cargarEnvLocal, variable } from './env.js';
import { crearAlmacenSupabase } from './respaldos/almacen.js';

const conEnv = cargarEnvLocal();

const puerto = Number(variable('PORT') ?? 3002);
// `CLOUD_HOST=0.0.0.0` para que el teléfono (en la misma Wi-Fi) alcance la nube.
const host = variable('CLOUD_HOST') ?? '127.0.0.1';
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

// Con SUPABASE_URL se valida el JWT contra el JWKS del proyecto (ES256). Si no, se usa el
// JWT secret legacy (HS256). Sin ninguno de los dos, los endpoints del dueño responden 401.
const supabaseUrl = variable('SUPABASE_URL');
const secretoJwt = variable('SUPABASE_JWT_SECRET');
const serviceRoleKey = variable('SUPABASE_SERVICE_ROLE_KEY');
const almacenObjetos =
  supabaseUrl && serviceRoleKey
    ? crearAlmacenSupabase({
        url: supabaseUrl,
        serviceKey: serviceRoleKey,
        bucket: variable('SUPABASE_STORAGE_BUCKET') ?? 'respaldos',
      })
    : null;
const app = crearApp({
  db,
  ...(supabaseUrl || secretoJwt
    ? { verificarJwt: crearVerificadorJwt({ url: supabaseUrl, secreto: secretoJwt }) }
    : {}),
  almacenObjetos,
  logger: true,
});

if (conEnv) app.log.info(`Variables cargadas de ${RUTA_ENV}`);
if (!supabaseUrl && !secretoJwt)
  app.log.warn('Sin SUPABASE_URL ni SUPABASE_JWT_SECRET: el login del dueño queda deshabilitado.');
if (!almacenObjetos)
  app.log.warn(
    'Sin SUPABASE_SERVICE_ROLE_KEY: el respaldo en la nube queda deshabilitado (sync sigue funcionando).',
  );

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
