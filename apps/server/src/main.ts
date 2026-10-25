import { RUTA_SEMILLA, cargarNormalizacion } from '@almacen/data';
import pkg from '../package.json' with { type: 'json' };
import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';
import { migrar } from './db/migrar.js';
import { RUTA_ENV, cargarEnvLocal, variable } from './env.js';
import { ClienteOff } from './productos/off.js';
import { Semilla } from './productos/semilla.js';

const conEnv = cargarEnvLocal();

const puerto = Number(variable('PORT') ?? 3001);
// Solo en la máquina de la caja; no se expone a la red local por ahora.
const host = variable('HOST') ?? '127.0.0.1';
const rutaDb = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const rutaSemilla = variable('ALMACEN_SEMILLA') ?? RUTA_SEMILLA;

const db = abrirDb(rutaDb);
migrar(db);
const semilla = Semilla.abrir(rutaSemilla);

// Open Food Facts en línea: exige un contacto en el User-Agent. Sin contacto (o con
// ALMACEN_OFF=0) la caja solo usa el local y la semilla.
const contacto = variable('ALMACEN_CONTACTO');
const off =
  contacto && variable('ALMACEN_OFF') !== '0'
    ? new ClienteOff({ version: pkg.version, contacto, normalizacion: cargarNormalizacion() })
    : null;

// En producción (instalador, Fase 6) no se puede elegir la modalidad MOCK.
const permitirModoPrueba = variable('NODE_ENV') !== 'production';

const app = crearApp({ db, semilla, off, permitirModoPrueba, logger: true });

if (conEnv) app.log.info(`Variables cargadas de ${RUTA_ENV}`);

if (semilla) {
  app.log.info(
    `Semilla de productos: ${rutaSemilla} (${semilla.meta['product_count'] ?? '?'} productos)`,
  );
} else {
  app.log.warn(
    `Sin semilla de productos (no existe ${rutaSemilla}). Genera una con \`pnpm data:build\`.`,
  );
}

if (off) {
  app.log.info(`Consulta en línea a Open Food Facts activa (${off.userAgent}).`);
} else {
  app.log.warn(
    contacto
      ? 'Consulta en línea a Open Food Facts desactivada (ALMACEN_OFF=0).'
      : 'Consulta en línea a Open Food Facts desactivada (falta ALMACEN_CONTACTO).',
  );
}

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
