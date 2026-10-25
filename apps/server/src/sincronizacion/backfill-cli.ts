/**
 * Encola en el outbox todo lo que ya existe en el local (categorías, productos y
 * movimientos de stock), para subirlo a la nube en la primera sincronización. Se usa
 * después de `db:seed` o al vincular una caja que ya tenía datos.
 *
 * Es idempotente del lado de la nube (upsert / on-conflict-do-nothing); reejecutarlo no
 * duplica datos, aunque sí agrega eventos al outbox local.
 */
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { categories, products, stockMovements } from '../db/schema.js';
import { cargarEnvLocal, variable } from '../env.js';
import { categoriaAWire, movimientoAWire, productoAWire } from './mapping.js';
import { encolar } from './outbox.js';

cargarEnvLocal();
const rutaDb = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const db = abrirDb(rutaDb);
migrar(db);

const conteo = db.transaction(() => {
  let categorias = 0;
  let productos = 0;
  let movimientos = 0;
  for (const c of db.select().from(categories).all()) {
    encolar(db, {
      entity: 'categories',
      entityId: c.id,
      op: 'INSERT',
      payload: categoriaAWire(c),
    });
    categorias++;
  }
  for (const p of db.select().from(products).all()) {
    encolar(db, { entity: 'products', entityId: p.id, op: 'INSERT', payload: productoAWire(p) });
    productos++;
  }
  for (const m of db.select().from(stockMovements).all()) {
    encolar(db, {
      entity: 'stock_movements',
      entityId: m.id,
      op: 'INSERT',
      payload: movimientoAWire(m),
    });
    movimientos++;
  }
  return { categorias, productos, movimientos };
});

console.log(
  `Encolado: ${conteo.categorias} categorías, ${conteo.productos} productos, ${conteo.movimientos} movimientos.`,
);
console.log('Se subirán a la nube en la próxima sincronización de la caja.');
