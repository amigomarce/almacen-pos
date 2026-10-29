import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  cashCloses,
  categories,
  customerLedger,
  customers,
  outbox,
  products,
  saleItems,
  saleReturns,
  sales,
  stockMovements,
} from '../db/schema.js';
import type { EventoSaliente, RepoSyncNube } from './servicio.js';

/** Repositorio real de sincronización sobre PostgreSQL (Drizzle). */
export function crearRepoSyncNube(db: Db): RepoSyncNube {
  return {
    async upsertProducto(p) {
      const { id: _id, ...set } = p;
      await db.insert(products).values(p).onConflictDoUpdate({ target: products.id, set });
    },
    async upsertCategoria(c) {
      const { id: _id, ...set } = c;
      await db.insert(categories).values(c).onConflictDoUpdate({ target: categories.id, set });
    },
    async borrarProducto(id) {
      await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, id));
    },
    async borrarCategoria(id) {
      await db.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, id));
    },
    async insertarVenta(v) {
      await db.insert(sales).values(v).onConflictDoNothing();
    },
    async actualizarVenta(v) {
      const { id: _id, ...set } = v;
      await db.insert(sales).values(v).onConflictDoUpdate({ target: sales.id, set });
    },
    async insertarLinea(l) {
      await db.insert(saleItems).values(l).onConflictDoNothing();
    },
    async insertarMovimiento(m) {
      await db.insert(stockMovements).values(m).onConflictDoNothing();
    },
    async insertarDevolucion(d) {
      await db.insert(saleReturns).values(d).onConflictDoNothing();
    },
    async upsertCliente(c) {
      const { id: _id, ...set } = c;
      await db.insert(customers).values(c).onConflictDoUpdate({ target: customers.id, set });
    },
    async insertarMovimientoFiado(m) {
      await db.insert(customerLedger).values(m).onConflictDoNothing();
    },
    async upsertCierre(c) {
      const { id: _id, ...set } = c;
      await db.insert(cashCloses).values(c).onConflictDoUpdate({ target: cashCloses.id, set });
    },
    async eventosPendientes(ownerId) {
      const filas = await db
        .select({
          id: outbox.id,
          entity: outbox.entity,
          entityId: outbox.entityId,
          op: outbox.op,
          payload: outbox.payload,
        })
        .from(outbox)
        .where(and(eq(outbox.ownerId, ownerId), isNull(outbox.syncedAt)))
        .orderBy(outbox.createdAt);
      return filas.map((f) => ({
        id: f.id,
        entity: f.entity,
        entityId: f.entityId,
        op: f.op,
        payload: f.payload,
      })) as EventoSaliente[];
    },
    async marcarSincronizados(ownerId, ids) {
      if (ids.length === 0) return;
      await db
        .update(outbox)
        .set({ syncedAt: new Date() })
        .where(and(eq(outbox.ownerId, ownerId), inArray(outbox.id, [...ids])));
    },
  };
}
