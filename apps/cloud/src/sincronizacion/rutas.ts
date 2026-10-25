import { ENTIDADES_SYNC, type EventoSync } from '@almacen/sync';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requiereDispositivo } from '../auth/requerir.js';
import type { RepoInstalaciones } from '../instalaciones/servicio.js';
import { ingestarEventos, type RepoSyncNube } from './servicio.js';

export interface DependenciasSincronizacion {
  repoInstalaciones: RepoInstalaciones;
  repoSync: RepoSyncNube;
}

const OPERACIONES = ['INSERT', 'UPDATE', 'DELETE'] as const;

/** Devuelve el dueño de la instalación autenticada; responde 409 si la caja no está vinculada. */
function duenoDe(req: FastifyRequest): string | null {
  return req.instalacion?.ownerId ?? null;
}

export function registrarSincronizacion(
  app: FastifyInstance,
  { repoInstalaciones, repoSync }: DependenciasSincronizacion,
): void {
  const conDispositivo = requiereDispositivo(repoInstalaciones);

  /** La caja sube sus eventos (outbox local): productos, categorías, ventas, stock. */
  app.post<{ Body: { events: EventoSync[] } }>(
    '/sync/push',
    {
      onRequest: conDispositivo,
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          additionalProperties: false,
          properties: {
            events: {
              type: 'array',
              maxItems: 500,
              items: {
                type: 'object',
                required: ['entity', 'op', 'entityId', 'payload'],
                additionalProperties: false,
                properties: {
                  entity: { type: 'string', enum: [...ENTIDADES_SYNC] },
                  op: { type: 'string', enum: [...OPERACIONES] },
                  entityId: { type: 'string', minLength: 1, maxLength: 64 },
                  payload: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const ownerId = duenoDe(req);
      if (!ownerId) {
        return reply
          .code(409)
          .send({ error: 'SIN_VINCULAR', mensaje: 'Vincula la caja a tu cuenta desde la app' });
      }
      await ingestarEventos(repoSync, ownerId, req.body.events);
      return reply.code(204).send();
    },
  );

  /** La caja baja los cambios del dueño (precios, productos) pendientes. */
  app.get('/sync/pull', { onRequest: conDispositivo }, async (req, reply) => {
    const ownerId = duenoDe(req);
    if (!ownerId) {
      return reply
        .code(409)
        .send({ error: 'SIN_VINCULAR', mensaje: 'Vincula la caja a tu cuenta desde la app' });
    }
    const eventos = await repoSync.eventosPendientes(ownerId);
    return { eventos };
  });

  /** La caja confirma qué eventos ya aplicó (at-least-once: se re-pullen hasta confirmar). */
  app.post<{ Body: { ids: string[] } }>(
    '/sync/ack',
    {
      onRequest: conDispositivo,
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: {
            ids: {
              type: 'array',
              maxItems: 500,
              items: { type: 'string', minLength: 1, maxLength: 64 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const ownerId = duenoDe(req);
      if (!ownerId) {
        return reply
          .code(409)
          .send({ error: 'SIN_VINCULAR', mensaje: 'Vincula la caja a tu cuenta desde la app' });
      }
      await repoSync.marcarSincronizados(ownerId, req.body.ids);
      return reply.code(204).send();
    },
  );
}
