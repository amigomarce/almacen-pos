import { ErrorDominio } from '@almacen/core';
import type { EntidadSync, EventoSync } from '@almacen/sync';
import { eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { outbox } from '../db/schema.js';
import { aplicarEventos } from './aplicar.js';

type Fetch = typeof fetch;

/** Un evento que baja de la nube: como `EventoSync`, pero con el `id` de la fila (para el ack). */
interface EventoBajado extends EventoSync {
  id: string;
}

export type FuenteUrlNube = string | (() => string | null);

export interface DepsSincronizar {
  /** URL fija o función que la lee de la configuración (para cambiarla desde la app). */
  cloudUrl: FuenteUrlNube;
  deviceToken: string;
  /** Inyectable para tests. */
  fetchFn?: Fetch;
}

export interface ResultadoSincronizacion {
  subidos: number;
  bajados: number;
}

const sinBarraFinal = (url: string) => url.replace(/\/+$/, '');

/**
 * Un ciclo de sincronización con la nube (at-least-once):
 * 1. Push: sube los eventos locales pendientes y los marca como sincronizados.
 * 2. Pull: baja los cambios del dueño, los aplica y los confirma con /ack.
 * Reenviar la misma tanda es idempotente (la nube hace upsert / on-conflict-do-nothing).
 */
export async function sincronizar(db: Db, deps: DepsSincronizar): Promise<ResultadoSincronizacion> {
  const fetchFn = deps.fetchFn ?? fetch;
  const cloudUrl = typeof deps.cloudUrl === 'string' ? deps.cloudUrl : deps.cloudUrl();
  if (!cloudUrl) {
    throw new ErrorDominio('NUBE_URL_REQUERIDA', 'Configura la dirección de la nube');
  }
  const base = sinBarraFinal(cloudUrl);
  const auth = { authorization: `Bearer ${deps.deviceToken}` };

  const pendientes = db.select().from(outbox).where(isNull(outbox.syncedAt)).all();
  if (pendientes.length > 0) {
    const eventos: EventoSync[] = pendientes.map((e) => ({
      entity: e.entity as EntidadSync,
      entityId: e.entityId,
      op: e.op,
      payload: e.payload,
    }));
    const res = await fetchFn(`${base}/sync/push`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ events: eventos }),
    });
    if (!res.ok) throw new Error(`push falló (${res.status})`);
    const ahora = new Date();
    for (const e of pendientes) {
      db.update(outbox).set({ syncedAt: ahora }).where(eq(outbox.id, e.id)).run();
    }
  }

  const resPull = await fetchFn(`${base}/sync/pull`, { headers: auth });
  if (!resPull.ok) throw new Error(`pull falló (${resPull.status})`);
  const { eventos } = (await resPull.json()) as { eventos: EventoBajado[] };
  if (eventos.length > 0) {
    aplicarEventos(db, eventos);
    const resAck = await fetchFn(`${base}/sync/ack`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: eventos.map((e) => e.id) }),
    });
    if (!resAck.ok) throw new Error(`ack falló (${resAck.status})`);
  }

  return { subidos: pendientes.length, bajados: eventos.length };
}

/** Corre la sincronización cada `intervaloMs` y devuelve cómo detenerla. */
export function iniciarSincronizacion(
  db: Db,
  deps: DepsSincronizar,
  intervaloMs = 10_000,
  log?: { error: (obj: object, msg: string) => void },
): () => void {
  const timer = setInterval(() => {
    const url = typeof deps.cloudUrl === 'string' ? deps.cloudUrl : deps.cloudUrl();
    if (!url) return;
    sincronizar(db, deps).catch((err: unknown) => {
      log?.error({ err }, 'Sincronización con la nube falló');
    });
  }, intervaloMs);
  return () => {
    clearInterval(timer);
  };
}
