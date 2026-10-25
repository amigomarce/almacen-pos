import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';

const puerto = Number(process.env.PORT ?? 3001);
// Solo en la máquina de la caja; no se expone a la red local por ahora.
const host = process.env.HOST ?? '127.0.0.1';
const rutaDb = process.env.ALMACEN_DB ?? 'var/almacen.sqlite';

const db = abrirDb(rutaDb);
const app = crearApp({ db, logger: true });

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
