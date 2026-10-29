import { MEDIOS_ABONO, type MedioAbono } from '@almacen/core';
import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import { buscarCaja } from '../caja/servicio.js';
import type { Db } from '../db/client.js';
import { ErrorHttp } from '../errores.js';
import {
  crearCliente,
  editarCliente,
  listarClientes,
  movimientosDe,
  obtenerCliente,
  registrarAbono,
  registrarAjuste,
  type DatosCliente,
} from './servicio.js';

const TEXTO = { type: ['string', 'null'], maxLength: 120 } as const;
const LIMITE = { type: ['integer', 'null'], minimum: 0, maximum: 100_000_000 } as const;
const PROPIEDADES_CLIENTE = {
  nombre: { type: 'string', minLength: 1, maxLength: 80 },
  telefono: { type: ['string', 'null'], maxLength: 30 },
  nota: TEXTO,
  limiteClp: LIMITE,
  activo: { type: 'boolean' },
} as const;

/** Fiado / cuenta corriente de vecinos (ADR-022). */
export function registrarFiado(
  app: FastifyInstance,
  { db, sesiones }: { db: Db; sesiones: Sesiones },
): void {
  const conSesion = requiereSesion(sesiones);
  const soloDueno = requiereSesion(sesiones, ['DUENO']);

  app.get<{ Querystring: { buscar?: string; inactivos?: '1'; orden?: 'deuda' | 'nombre' } }>(
    '/customers',
    { onRequest: conSesion },
    (req) =>
      listarClientes(db, {
        ...(req.query.buscar ? { buscar: req.query.buscar } : {}),
        incluirInactivos: req.query.inactivos === '1',
        porDeuda: req.query.orden === 'deuda',
      }),
  );

  app.get<{ Params: { id: string } }>('/customers/:id', { onRequest: conSesion }, (req) => ({
    cliente: obtenerCliente(db, req.params.id),
    movimientos: movimientosDe(db, req.params.id),
  }));

  app.post<{ Body: DatosCliente }>(
    '/customers',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          type: 'object',
          required: ['nombre'],
          additionalProperties: false,
          properties: PROPIEDADES_CLIENTE,
        },
      },
    },
    (req, reply) => reply.code(201).send(crearCliente(db, req.body)),
  );

  app.patch<{ Params: { id: string }; Body: DatosCliente }>(
    '/customers/:id',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: PROPIEDADES_CLIENTE,
        },
      },
    },
    (req) => editarCliente(db, req.params.id, req.body),
  );

  /** Abono del vecino: necesita la caja abierta (el efectivo entra al cajón del turno). */
  app.post<{
    Params: { id: string };
    Body: { montoClp: number; medioPago: MedioAbono; registerId?: string };
  }>(
    '/customers/:id/payments',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['montoClp', 'medioPago'],
          additionalProperties: false,
          properties: {
            montoClp: { type: 'integer', minimum: 1, maximum: 1_000_000_000 },
            medioPago: { type: 'string', enum: [...MEDIOS_ABONO] },
            registerId: { type: 'string' },
          },
        },
      },
    },
    (req, reply) => {
      const caja = buscarCaja(db, req.body.registerId);
      if (!caja) throw new ErrorHttp('CAJA_NO_ENCONTRADA', 'No hay una caja activa', 404);
      const r = registrarAbono(db, {
        clienteId: req.params.id,
        montoClp: req.body.montoClp,
        medioPago: req.body.medioPago,
        registerId: caja.id,
        usuarioId: req.sesion?.usuario.id ?? '',
      });
      return reply.code(201).send(r);
    },
  );

  /** Ajuste del dueño (perdonar deuda, corregir): positivo aumenta la deuda, negativo la baja. */
  app.post<{ Params: { id: string }; Body: { montoClp: number; motivo: string } }>(
    '/customers/:id/adjustments',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          type: 'object',
          required: ['montoClp', 'motivo'],
          additionalProperties: false,
          properties: {
            montoClp: { type: 'integer', minimum: -1_000_000_000, maximum: 1_000_000_000 },
            motivo: { type: 'string', minLength: 3, maxLength: 200, pattern: '\\S' },
          },
        },
      },
    },
    (req, reply) =>
      reply.code(201).send(
        registrarAjuste(db, {
          clienteId: req.params.id,
          montoClp: req.body.montoClp,
          motivo: req.body.motivo,
          usuarioId: req.sesion?.usuario.id ?? '',
        }),
      ),
  );
}
