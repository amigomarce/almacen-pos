/**
 * Imprime la identidad de la caja (installationId + deviceToken) para vincularla desde la app
 * del dueño. La genera la primera vez si no existe. El token es un secreto local: no lo
 * compartas fuera de la vinculación.
 */
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { cargarEnvLocal, variable } from '../env.js';
import { obtenerIdentidad } from './identidad.js';

cargarEnvLocal();
const rutaDb = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const db = abrirDb(rutaDb);
migrar(db);
const { installationId, deviceToken } = obtenerIdentidad(db);

console.log('Vincula esta caja desde la app del dueño (pantalla "Caja"):');
console.log('');
console.log(`  instalación: ${installationId}`);
console.log(`  token:       ${deviceToken}`);
console.log('');
console.log(`Base local: ${rutaDb}`);
