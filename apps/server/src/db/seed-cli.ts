import { cargarEnvLocal, variable } from '../env.js';
import { abrirDb } from './client.js';
import { migrar } from './migrar.js';
import { sembrar } from './seed.js';

cargarEnvLocal();
const ruta = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const db = abrirDb(ruta);
migrar(db);
console.log(
  sembrar(db) ? `Base sembrada en ${ruta}` : `La base ${ruta} ya tenía datos; no se tocó.`,
);
db.$client.close();
