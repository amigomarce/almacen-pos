import { dirname, join } from 'node:path';
import { RUTA_SEMILLA, cargarNormalizacion } from '@almacen/data';
import pkg from '../package.json' with { type: 'json' };
import { crearApp } from './app.js';
import { leerConfiguracion } from './configuracion/servicio.js';
import { abrirDb } from './db/client.js';
import { migrar } from './db/migrar.js';
import { RUTA_ENV, cargarEnvLocal, variable } from './env.js';
import { ClienteOff } from './productos/off.js';
import { iniciarRespaldos } from './respaldos/servicio.js';
import { Semilla } from './productos/semilla.js';
import { leerClaveSii } from './sii/cifrado.js';
import { iniciarEnvioSii } from './sii/envio.js';
import { iniciarSincronizacion } from './sincronizacion/cliente.js';
import { obtenerIdentidad } from './sincronizacion/identidad.js';

const conEnv = cargarEnvLocal();

const puerto = Number(variable('PORT') ?? 3001);
// Solo en la máquina de la caja; no se expone a la red local por ahora.
const host = variable('HOST') ?? '127.0.0.1';
const rutaDb = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const rutaSemilla = variable('ALMACEN_SEMILLA') ?? RUTA_SEMILLA;
const dirRespaldos = variable('ALMACEN_RESPALDOS') ?? join(dirname(rutaDb), 'respaldos');
const rutaClaveSii = variable('ALMACEN_SII_KEY') ?? 'var/sii.key';

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

// Sidecar del instalador: si la app de escritorio muere sin cerrar el servidor, este se apaga
// solo al detectar que el proceso padre ya no existe.
const padre = Number(variable('ALMACEN_PADRE_PID') ?? '');
if (Number.isInteger(padre) && padre > 0) {
  setInterval(() => {
    try {
      process.kill(padre, 0);
    } catch {
      process.exit(0);
    }
  }, 5_000).unref();
}

const app = crearApp({
  db,
  semilla,
  off,
  permitirModoPrueba,
  logger: true,
  claveSii: () => leerClaveSii(rutaClaveSii),
  respaldos: { dir: dirRespaldos, rutaDb, rutaClaveSii },
});

if (conEnv) app.log.info(`Variables cargadas de ${RUTA_ENV}`);

iniciarRespaldos(db, {
  dir: dirRespaldos,
  rutaDb,
  rutaClaveSii,
  log: {
    info: (obj, msg) => {
      app.log.info(obj, msg);
    },
    warn: (obj, msg) => {
      app.log.warn(obj, msg);
    },
    error: (obj, msg) => {
      app.log.error(obj, msg);
    },
  },
});
app.log.info(`Respaldos locales en ${dirRespaldos} (uno por día, se conservan 14).`);

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

// Sincronización con la nube (Fase 4): solo si está configurada la URL de la nube.
const cloudUrl = variable('CLOUD_URL');
if (cloudUrl) {
  const identidad = obtenerIdentidad(db);
  iniciarSincronizacion(db, { cloudUrl, deviceToken: identidad.deviceToken }, 10_000, app.log);
  app.log.info(
    `Sincronización con la nube activa (${cloudUrl}; instalación ${identidad.installationId}).`,
  );
} else {
  app.log.warn('CLOUD_URL sin definir: la caja no sincroniza con la nube.');
}

// Cola de boletas al SII (Fase 5): solo si el local emite directo. En `PUENTE_MANUAL` no hay
// nada que enviar y la clave local ni se toca.
if (leerConfiguracion(db).dteProvider === 'SII_DIRECTO') {
  iniciarEnvioSii(db, {
    clave: () => leerClaveSii(),
    log: {
      info: (obj, msg) => {
        app.log.info(obj, msg);
      },
      warn: (obj, msg) => {
        app.log.warn(obj, msg);
      },
      error: (obj, msg) => {
        app.log.error(obj, msg);
      },
    },
  });
  app.log.info('Envío de boletas al SII activo (cada 2 minutos).');
}

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
