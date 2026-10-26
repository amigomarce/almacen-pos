import type { EventoSync } from '@almacen/sync';
import { and, isNotNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { outbox } from '../db/schema.js';

/**
 * Encola un evento en el `outbox` local para subirlo a la nube. Se llama dentro de la misma
 * transacción que el cambio de datos, así nunca se pierde un evento aunque el proceso se caiga.
 */
export function encolar(db: Db, evento: EventoSync): void {
  db.insert(outbox)
    .values({
      entity: evento.entity,
      entityId: evento.entityId,
      op: evento.op,
      payload: evento.payload,
    })
    .run();
}

/** Días que se guardan los eventos ya subidos, por si hay que revisar qué se sincronizó. */
export const RETENCION_OUTBOX_DIAS = 30;

/**
 * Borra los eventos que la nube ya confirmó hace más de `retencionDias`. El outbox es solo la
 * cola de envío: el historial (ventas, anulaciones, movimientos de stock, cambios de precio)
 * vive en sus propias tablas y en la nube, así que podarlo no borra nada auditado. Los
 * pendientes (`synced_at` nulo) nunca se tocan. Devuelve cuántos borró.
 */
export function podarOutbox(
  db: Db,
  ahora = new Date(),
  retencionDias = RETENCION_OUTBOX_DIAS,
): number {
  const limite = new Date(ahora.getTime() - retencionDias * 24 * 60 * 60 * 1000);
  return db
    .delete(outbox)
    .where(and(isNotNull(outbox.syncedAt), lt(outbox.syncedAt, limite)))
    .run().changes;
}
