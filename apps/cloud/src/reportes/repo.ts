import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cashCloses, products, sales, stockMovements } from '../db/schema.js';
import { calcularStockBajo, resumirVentas, type RepoReportes } from './servicio.js';

/** Repositorio real de reportes sobre PostgreSQL (Drizzle). */
export function crearRepoReportes(db: Db): RepoReportes {
  return {
    async resumenVentas(ownerId, desde) {
      const filas = await db
        .select({ totalClp: sales.totalClp, paymentMethod: sales.paymentMethod })
        .from(sales)
        .where(
          and(eq(sales.ownerId, ownerId), eq(sales.status, 'OK'), gte(sales.createdAt, desde)),
        );
      return resumirVentas(filas);
    },
    async stockBajo(ownerId) {
      const conMinimo = await db
        .select({
          id: products.id,
          name: products.name,
          unit: products.unit,
          stockMinMilli: products.stockMinMilli,
        })
        .from(products)
        .where(
          and(
            eq(products.ownerId, ownerId),
            isNull(products.deletedAt),
            isNotNull(products.stockMinMilli),
          ),
        );
      if (conMinimo.length === 0) return [];
      // Postgres suma los movimientos: una fila por producto, no todo el historial en memoria.
      const saldos = await db
        .select({
          productId: stockMovements.productId,
          total: sql<string>`coalesce(sum(${stockMovements.qtyMilli}), 0)`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.ownerId, ownerId),
            inArray(
              stockMovements.productId,
              conMinimo.map((p) => p.id),
            ),
          ),
        )
        .groupBy(stockMovements.productId);
      return calcularStockBajo(
        conMinimo,
        saldos.map((s) => ({ productId: s.productId, qty: Number(s.total) })),
      );
    },
    async ultimoCierre(ownerId) {
      const [fila] = await db
        .select()
        .from(cashCloses)
        .where(eq(cashCloses.ownerId, ownerId))
        .orderBy(desc(cashCloses.closedAt))
        .limit(1);
      if (!fila) return null;
      return {
        id: fila.id,
        registerId: fila.registerId,
        registerName: fila.registerName,
        closedAt: fila.closedAt.toISOString(),
        countedCashClp: fila.countedCashClp,
        expectedCashClp: fila.expectedCashClp,
        differenceClp: fila.differenceClp,
        totalVentasClp: fila.totalVentasClp,
        cantidadVentas: fila.cantidadVentas,
      };
    },
  };
}
