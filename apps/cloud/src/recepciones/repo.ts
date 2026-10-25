import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { outbox, products, stockMovements } from '../db/schema.js';
import { productoAWire, movimientoAWire } from '../sincronizacion/mapping.js';
import type { RepoRecepciones } from './servicio.js';

/** Repositorio real de recepciones sobre PostgreSQL (Drizzle). */
export function crearRepoRecepciones(db: Db): RepoRecepciones {
  return {
    async porId(ownerId, id) {
      const [fila] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.ownerId, ownerId), isNull(products.deletedAt)));
      return fila ?? null;
    },
    async stockDe(ownerId, productId) {
      const [fila] = await db
        .select({ total: sql<string>`coalesce(sum(${stockMovements.qtyMilli}), 0)` })
        .from(stockMovements)
        .where(and(eq(stockMovements.ownerId, ownerId), eq(stockMovements.productId, productId)));
      return Number(fila?.total ?? 0);
    },
    async guardar(ownerId, { producto, movimiento }) {
      await db.transaction(async (tx) => {
        if (producto) {
          const { id: _id, ...set } = producto;
          await tx
            .update(products)
            .set(set)
            .where(and(eq(products.id, producto.id), eq(products.ownerId, ownerId)));
          await tx.insert(outbox).values({
            ownerId,
            entity: 'products',
            entityId: producto.id,
            op: 'UPDATE',
            payload: productoAWire(producto),
          });
        }
        const [mov] = await tx
          .insert(stockMovements)
          .values({ ...movimiento, ownerId })
          .returning();
        if (mov) {
          await tx.insert(outbox).values({
            ownerId,
            entity: 'stock_movements',
            entityId: mov.id,
            op: 'INSERT',
            payload: movimientoAWire(mov),
          });
        }
      });
    },
  };
}
