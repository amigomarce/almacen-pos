import { and, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
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
      const movimientos = await db
        .select({ productId: stockMovements.productId, qty: stockMovements.qtyMilli })
        .from(stockMovements)
        .where(eq(stockMovements.ownerId, ownerId));
      return calcularStockBajo(conMinimo, movimientos);
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
