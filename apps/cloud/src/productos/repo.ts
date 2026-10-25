import { and, eq, isNull, like, or } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { outbox, products } from '../db/schema.js';
import { productoAWire } from '../sincronizacion/mapping.js';
import type { ProductoCloud, RepoProductos } from './servicio.js';

/** Repositorio real de productos del dueño sobre PostgreSQL (Drizzle). */
export function crearRepoProductos(db: Db): RepoProductos {
  return {
    async porId(ownerId, id) {
      const [fila] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.ownerId, ownerId), isNull(products.deletedAt)));
      return fila ?? null;
    },
    async listar(ownerId, buscar, limite) {
      const condiciones = [
        eq(products.ownerId, ownerId),
        isNull(products.deletedAt),
        ...(buscar
          ? [
              or(
                like(products.name, `%${buscar}%`),
                like(products.brand, `%${buscar}%`),
                eq(products.barcode, buscar),
              ),
            ]
          : []),
      ];
      return db
        .select()
        .from(products)
        .where(and(...condiciones))
        .orderBy(products.name)
        .limit(limite);
    },
    async guardarCambio(ownerId, p: ProductoCloud) {
      await db.transaction(async (tx) => {
        const { id: _id, ...set } = p;
        await tx
          .update(products)
          .set(set)
          .where(and(eq(products.id, p.id), eq(products.ownerId, ownerId)));
        await tx.insert(outbox).values({
          ownerId,
          entity: 'products',
          entityId: p.id,
          op: 'UPDATE',
          payload: productoAWire(p),
        });
      });
    },
  };
}
