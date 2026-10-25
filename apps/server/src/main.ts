import { RUTA_SEMILLA } from '@almacen/data';
import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';
import { migrar } from './db/migrar.js';
import { Semilla } from './productos/semilla.js';

const puerto = Number(process.env.PORT ?? 3001);
// Solo en la máquina de la caja; no se expone a la red local por ahora.
const host = process.env.HOST ?? '127.0.0.1';
const rutaDb = process.env.ALMACEN_DB ?? 'var/almacen.sqlite';
const rutaSemilla = process.env.ALMACEN_SEMILLA ?? RUTA_SEMILLA;

const db = abrirDb(rutaDb);
migrar(db);
const semilla = Semilla.abrir(rutaSemilla);
const app = crearApp({ db, semilla, logger: true });

if (semilla) {
  app.log.info(
    `Semilla de productos: ${rutaSemilla} (${semilla.meta['product_count'] ?? '?'} productos)`,
  );
} else {
  app.log.warn(
    `Sin semilla de productos (no existe ${rutaSemilla}). Genera una con \`pnpm data:build\`.`,
  );
}

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
