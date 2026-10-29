import type {
  CategoriaWire,
  CierreCajaWire,
  DevolucionWire,
  EntidadSync,
  EventoSync,
  LineaVentaWire,
  MovimientoStockWire,
  OperacionSync,
  ProductoWire,
  VentaWire,
} from '@almacen/sync';
import {
  categoriaDeWire,
  cierreDeWire,
  devolucionDeWire,
  lineaDeWire,
  movimientoDeWire,
  productoDeWire,
  ventaDeWire,
} from './mapping.js';
import type {
  cashCloses,
  categories,
  products,
  saleItems,
  saleReturns,
  sales,
  stockMovements,
} from '../db/schema.js';

/** Evento de la cola de la nube hacia la caja (lo que devuelve `GET /sync/pull`). */
export interface EventoSaliente {
  id: string;
  entity: EntidadSync;
  entityId: string;
  op: OperacionSync;
  payload: unknown;
}

/** Acceso a las tablas de la nube, desacoplado del driver (tests usan un repo en memoria). */
export interface RepoSyncNube {
  upsertProducto(p: typeof products.$inferInsert): Promise<void>;
  upsertCategoria(c: typeof categories.$inferInsert): Promise<void>;
  borrarProducto(id: string): Promise<void>;
  borrarCategoria(id: string): Promise<void>;
  insertarVenta(v: typeof sales.$inferInsert): Promise<void>;
  /** Refleja una venta anulada (upsert: si llegó desordenado, inserta el estado final). */
  actualizarVenta(v: typeof sales.$inferInsert): Promise<void>;
  insertarLinea(l: typeof saleItems.$inferInsert): Promise<void>;
  insertarMovimiento(m: typeof stockMovements.$inferInsert): Promise<void>;
  upsertCierre(c: typeof cashCloses.$inferInsert): Promise<void>;
  insertarDevolucion(d: typeof saleReturns.$inferInsert): Promise<void>;
  eventosPendientes(ownerId: string): Promise<EventoSaliente[]>;
  marcarSincronizados(ownerId: string, ids: readonly string[]): Promise<void>;
}

/**
 * Ingresa una tanda de eventos de la caja (push). Es idempotente: reenviar la misma tanda no
 * duplica nada (upsert en productos/categorías, "on conflict do nothing" en los append-only).
 * Los eventos vienen de nuestro propio código (la caja): se confía en el payload y las
 * restricciones de la base (NOT NULL/CHECK) rechazan cualquier fila mal formada.
 */
export async function ingestarEventos(
  repo: RepoSyncNube,
  ownerId: string,
  eventos: readonly EventoSync[],
): Promise<void> {
  for (const e of eventos) {
    if (e.entity === 'products') {
      if (e.op === 'DELETE') await repo.borrarProducto(e.entityId);
      else await repo.upsertProducto(productoDeWire(e.payload as ProductoWire, ownerId));
    } else if (e.entity === 'categories') {
      if (e.op === 'DELETE') await repo.borrarCategoria(e.entityId);
      else await repo.upsertCategoria(categoriaDeWire(e.payload as CategoriaWire, ownerId));
    } else if (e.entity === 'sales' && e.op === 'INSERT') {
      await repo.insertarVenta(ventaDeWire(e.payload as VentaWire, ownerId));
    } else if (e.entity === 'sales' && e.op === 'UPDATE') {
      await repo.actualizarVenta(ventaDeWire(e.payload as VentaWire, ownerId));
    } else if (e.entity === 'sale_items' && e.op === 'INSERT') {
      await repo.insertarLinea(lineaDeWire(e.payload as LineaVentaWire));
    } else if (e.entity === 'stock_movements' && e.op === 'INSERT') {
      await repo.insertarMovimiento(movimientoDeWire(e.payload as MovimientoStockWire, ownerId));
    } else if (e.entity === 'cash_closes' && e.op === 'INSERT') {
      await repo.upsertCierre(cierreDeWire(e.payload as CierreCajaWire, ownerId));
    } else if (e.entity === 'sale_returns' && e.op === 'INSERT') {
      await repo.insertarDevolucion(devolucionDeWire(e.payload as DevolucionWire, ownerId));
    }
    // Cualquier otro (UPDATE/DELETE de append-only) se ignora: esas entidades solo se insertan.
  }
}
