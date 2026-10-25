import type { EventoSync } from '@almacen/sync';
import type { Db } from '../db/client.js';
import { outbox } from '../db/schema.js';

/**
 * Encuela un evento en el `outbox` local para subirlo a la nube. Se llama dentro de la misma
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
