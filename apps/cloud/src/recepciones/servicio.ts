import { costoPromedio } from '@almacen/core';
import { v7 as uuidv7 } from 'uuid';
import type { stockMovements } from '../db/schema.js';
import type { ProductoCloud } from '../productos/servicio.js';

export interface LineaRecepcion {
  productId: string;
  cantidadMilli: number;
  /** Costo por unidad o kg (opcional): recalcula el costo promedio. */
  costoUnitarioClp?: number;
}

export interface LineaRecibida {
  productId: string;
  nombre: string;
  stockAnteriorMilli: number;
  stockNuevoMilli: number;
  costoNuevoClp: number | null;
}

export interface ResultadoRecepcion {
  recepcionId: string;
  lineas: LineaRecibida[];
}

export interface RepoRecepciones {
  porId(ownerId: string, id: string): Promise<ProductoCloud | null>;
  /** Saldo actual del producto (suma de sus movimientos). */
  stockDe(ownerId: string, productId: string): Promise<number>;
  /** Actualiza el costo (si cambió) e inserta el movimiento, encolando ambos en la misma transacción. */
  guardar(
    ownerId: string,
    datos: {
      producto?: ProductoCloud;
      movimiento: Omit<typeof stockMovements.$inferInsert, 'ownerId'>;
    },
  ): Promise<void>;
}

export type ResultadoRegistroRecepcion =
  | { ok: true; resultado: ResultadoRecepcion }
  | { ok: false; error: 'PRODUCTO_NO_ENCONTRADO'; productId: string };

/**
 * Recepción de mercadería desde el móvil: suma stock (movimiento RECEPCION) y, si viene el
 * costo, recalcula el costo promedio. El movimiento baja a la caja por el outbox de la nube.
 */
export async function registrarRecepcion(
  repo: RepoRecepciones,
  args: { ownerId: string; lineas: readonly LineaRecepcion[]; ahora: Date },
): Promise<ResultadoRegistroRecepcion> {
  const recepcionId = uuidv7();
  const lineas: LineaRecibida[] = [];
  for (const linea of args.lineas) {
    const p = await repo.porId(args.ownerId, linea.productId);
    if (!p) return { ok: false, error: 'PRODUCTO_NO_ENCONTRADO', productId: linea.productId };
    const stockAnterior = await repo.stockDe(args.ownerId, p.id);
    const costoNuevo =
      linea.costoUnitarioClp !== undefined
        ? costoPromedio(stockAnterior, p.costClp, linea.cantidadMilli, linea.costoUnitarioClp)
        : p.costClp;
    const producto: ProductoCloud | undefined =
      costoNuevo !== p.costClp
        ? { ...p, costClp: costoNuevo, version: p.version + 1, updatedAt: args.ahora }
        : undefined;
    const movimiento = {
      id: uuidv7(),
      productId: p.id,
      qtyMilli: linea.cantidadMilli,
      type: 'RECEPCION' as const,
      refId: recepcionId,
      at: args.ahora,
    };
    await repo.guardar(args.ownerId, {
      ...(producto ? { producto } : {}),
      movimiento,
    });
    lineas.push({
      productId: p.id,
      nombre: p.name,
      stockAnteriorMilli: stockAnterior,
      stockNuevoMilli: stockAnterior + linea.cantidadMilli,
      costoNuevoClp: costoNuevo,
    });
  }
  return { ok: true, resultado: { recepcionId, lineas } };
}
