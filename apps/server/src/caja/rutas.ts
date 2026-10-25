import type { FastifyInstance, FastifyReply } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import {
  abrirCaja,
  buscarCaja,
  cerrarCaja,
  sesionAbierta,
  sesionPorId,
  type Caja,
} from './servicio.js';

const MONTO = { type: 'integer', minimum: 0, maximum: 1_000_000_000 } as const;

export function registrarCaja(
  app: FastifyInstance,
  { db, sesiones }: { db: Db; sesiones: Sesiones },
): void {
  const conSesion = requiereSesion(sesiones);

  const cajaO404 = (reply: FastifyReply, registerId?: string): Caja | null => {
    const caja = buscarCaja(db, registerId);
    if (!caja) {
      void reply.code(404).send({ error: 'CAJA_NO_ENCONTRADA', mensaje: 'No hay una caja activa' });
    }
    return caja;
  };

  /** Estado de la caja de este equipo: si está abierta, con su resumen al momento. */
  app.get<{ Querystring: { registerId?: string } }>(
    '/cash/current',
    { preHandler: conSesion },
    (req, reply) => {
      const caja = cajaO404(reply, req.query.registerId);
      if (!caja) return reply;
      const abierta = sesionAbierta(db, caja.id);
      return { caja, sesion: abierta?.sesion ?? null, resumen: abierta?.resumen ?? null };
    },
  );

  app.post<{ Body: { efectivoInicialClp: number; registerId?: string } }>(
    '/cash/open',
    {
      preHandler: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['efectivoInicialClp'],
          additionalProperties: false,
          properties: { efectivoInicialClp: MONTO, registerId: { type: 'string' } },
        },
      },
    },
    (req, reply) => {
      const caja = cajaO404(reply, req.body.registerId);
      if (!caja || !req.sesion) return reply;
      const r = abrirCaja(db, {
        registerId: caja.id,
        usuarioId: req.sesion.usuario.id,
        efectivoInicialClp: req.body.efectivoInicialClp,
      });
      if (!r.ok) {
        return reply.code(409).send({
          error: 'CAJA_ABIERTA',
          mensaje: `La caja ya está abierta (la abrió ${r.datos.sesion.abiertaPor.name})`,
        });
      }
      return reply.code(201).send({ caja, ...r.datos });
    },
  );

  app.post<{ Body: { efectivoContadoClp: number; registerId?: string } }>(
    '/cash/close',
    {
      preHandler: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['efectivoContadoClp'],
          additionalProperties: false,
          properties: { efectivoContadoClp: MONTO, registerId: { type: 'string' } },
        },
      },
    },
    (req, reply) => {
      const caja = cajaO404(reply, req.body.registerId);
      if (!caja || !req.sesion) return reply;
      const r = cerrarCaja(db, {
        registerId: caja.id,
        usuarioId: req.sesion.usuario.id,
        efectivoContadoClp: req.body.efectivoContadoClp,
      });
      if (!r.ok) {
        return reply.code(409).send({ error: 'CAJA_CERRADA', mensaje: 'La caja no está abierta' });
      }
      return { caja, ...r.datos };
    },
  );

  /** Una sesión pasada (para revisar o reimprimir un cierre). */
  app.get<{ Params: { id: string } }>(
    '/cash/sessions/:id',
    { preHandler: conSesion },
    (req, reply) => {
      const r = sesionPorId(db, req.params.id);
      if (!r)
        return reply
          .code(404)
          .send({ error: 'NO_ENCONTRADO', mensaje: 'Sesión de caja no encontrada' });
      return r;
    },
  );
}
