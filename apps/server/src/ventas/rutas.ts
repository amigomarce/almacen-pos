import { MEDIOS_PAGO } from '@almacen/core';
import type { FastifyInstance } from 'fastify';
import { autorizarDueno } from '../auth/autorizacion.js';
import type { LimitadorIntentos } from '../auth/intentos.js';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import { buscarCaja } from '../caja/servicio.js';
import type { Db } from '../db/client.js';
import { ErrorHttp } from '../errores.js';
import type { DependenciasSii } from '../sii/proveedor.js';
import {
  anularVenta,
  cotizarVenta,
  obtenerVenta,
  registrarFolioSii,
  registrarVenta,
  ultimaVentaId,
  type PedidoVenta,
  ventasDelTurno,
} from './servicio.js';
import { registrarDevolucion } from './devoluciones.js';

const ENTERO_POSITIVO = { type: 'integer', minimum: 1, maximum: 1_000_000_000 } as const;
const MONTO = { type: 'integer', minimum: 0, maximum: 1_000_000_000 } as const;
const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const;

const ESQUEMA_VENTA = {
  type: 'object',
  required: ['id', 'lineas', 'medioPago'],
  additionalProperties: false,
  properties: {
    id: UUID,
    registerId: { type: 'string' },
    medioPago: { type: 'string', enum: [...MEDIOS_PAGO] },
    pagadoClp: MONTO,
    entrega: { type: 'string', enum: ['IMPRESA', 'VIRTUAL'] },
    totalEsperadoClp: MONTO,
    clienteId: { type: 'string', minLength: 1 },
    /** Fiado sobre el límite: clave del dueño (el dueño con su sesión no la necesita). */
    pinDueno: { type: 'string', pattern: '^[0-9]{4,8}$' },
    lineas: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: {
        type: 'object',
        required: ['productoId', 'cantidadMilli'],
        additionalProperties: false,
        properties: {
          productoId: { type: ['string', 'null'], minLength: 1 },
          nombre: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
          unidad: { type: 'string', enum: ['UN', 'KG'] },
          cantidadMilli: ENTERO_POSITIVO,
          precioUnitarioClp: MONTO,
          tipoImpuesto: { type: 'string', enum: ['AFECTO', 'EXENTO'] },
          descuentoManualClp: MONTO,
          montoFijoClp: ENTERO_POSITIVO,
        },
      },
    },
  },
} as const;

export function registrarVentas(
  app: FastifyInstance,
  {
    db,
    sesiones,
    intentos,
    sii,
  }: {
    db: Db;
    sesiones: Sesiones;
    intentos: LimitadorIntentos;
    sii?: DependenciasSii;
  },
): void {
  const conSesion = requiereSesion(sesiones);

  const cajaOError = (registerId?: string) => {
    const caja = buscarCaja(db, registerId);
    if (!caja) throw new ErrorHttp('CAJA_NO_ENCONTRADA', 'No hay una caja activa', 404);
    return caja;
  };

  app.post<{ Body: PedidoVenta & { registerId?: string; pinDueno?: string } }>(
    '/sales',
    { onRequest: conSesion, schema: { body: ESQUEMA_VENTA } },
    async (req, reply) => {
      const caja = cajaOError(req.body.registerId);
      const { registerId: _registerId, pinDueno, ...pedido } = req.body;
      // Fiado sobre el límite: lo autoriza el dueño (su sesión, o su clave en la caja del cajero).
      let fiadoAutorizadoPorId: string | null = null;
      if (pedido.medioPago === 'FIADO') {
        if (req.sesion?.usuario.role === 'DUENO') fiadoAutorizadoPorId = req.sesion.usuario.id;
        else if (pinDueno) {
          const a = autorizarDueno(db, intentos, pinDueno);
          if (!a.ok) return reply.code(a.estado).send(a.cuerpo);
          fiadoAutorizadoPorId = a.dueno.id;
        }
      }
      const r = await registrarVenta(
        db,
        {
          pedido,
          registerId: caja.id,
          cajeroId: req.sesion?.usuario.id ?? '',
          fiadoAutorizadoPorId,
        },
        req.log,
        sii,
      );
      return reply.code(r.repetida ? 200 : 201).send(r.venta);
    },
  );

  /** Total del carrito mientras se escanea (mismas reglas que al cobrar). */
  app.post<{ Body: { lineas: PedidoVenta['lineas'] } }>(
    '/sales/quote',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['lineas'],
          additionalProperties: false,
          properties: { lineas: { ...ESQUEMA_VENTA.properties.lineas, minItems: 0 } },
        },
      },
    },
    (req) => cotizarVenta(db, req.body.lineas),
  );

  /** Ventas del turno abierto (Caja → Ventas del turno), de la más nueva a la más antigua. */
  app.get<{ Querystring: { registerId?: string } }>(
    '/sales/turno',
    { onRequest: conSesion },
    (req) => ventasDelTurno(db, cajaOError(req.query.registerId).id),
  );

  /** Última venta del turno abierto (para reimprimir o anular). */
  app.get<{ Querystring: { registerId?: string } }>(
    '/sales/last',
    { onRequest: conSesion },
    async (req, reply) => {
      const id = ultimaVentaId(db, cajaOError(req.query.registerId).id);
      if (!id)
        return reply
          .code(404)
          .send({ error: 'SIN_VENTAS', mensaje: 'No hay ventas en este turno' });
      return obtenerVenta(db, id);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/sales/:id',
    { onRequest: conSesion },
    async (req, reply) => {
      const v = await obtenerVenta(db, req.params.id);
      if (!v)
        return reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Venta no encontrada' });
      return v;
    },
  );

  /**
   * Anular. El dueño (con su sesión) anula cualquier venta del turno abierto. El cajero solo
   * la última, y con la clave del dueño.
   */
  app.post<{ Params: { id: string }; Body: { motivo: string; pinDueno?: string } }>(
    '/sales/:id/void',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['motivo'],
          additionalProperties: false,
          properties: {
            motivo: { type: 'string', minLength: 3, maxLength: 200, pattern: '\\S' },
            pinDueno: { type: 'string', pattern: '^[0-9]{4,8}$' },
          },
        },
      },
    },
    async (req, reply) => {
      const usuario = req.sesion?.usuario;
      /* v8 ignore next -- requiereSesion lo garantiza */
      if (!usuario) return reply.code(401).send();
      let autorizadaPorId = usuario.id;
      if (usuario.role !== 'DUENO') {
        if (!req.body.pinDueno) {
          return reply.code(403).send({
            error: 'FALTA_CLAVE_DUENO',
            mensaje: 'Para anular se necesita la clave del dueño',
          });
        }
        const a = autorizarDueno(db, intentos, req.body.pinDueno);
        if (!a.ok) return reply.code(a.estado).send(a.cuerpo);
        autorizadaPorId = a.dueno.id;
      }
      const r = await anularVenta(db, {
        ventaId: req.params.id,
        autorizadaPorId,
        motivo: req.body.motivo,
        soloUltima: usuario.role !== 'DUENO',
        usuarioId: usuario.id,
      });
      req.log.warn(
        { ventaId: r.venta.id, numero: r.venta.numero, cajero: usuario.name },
        'Venta anulada',
      );
      return r;
    },
  );

  /**
   * Devolución parcial (ADR-021): algunos productos vuelven. Misma autorización que anular: el
   * dueño con su sesión, o el cajero con la clave del dueño.
   */
  app.post<{
    Params: { id: string };
    Body: {
      items: { lineaId: string; cantidadMilli: number }[];
      motivo: string;
      pinDueno?: string;
      registerId?: string;
    };
  }>(
    '/sales/:id/returns',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['items', 'motivo'],
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: {
                type: 'object',
                required: ['lineaId', 'cantidadMilli'],
                additionalProperties: false,
                properties: {
                  lineaId: { type: 'string', minLength: 1 },
                  cantidadMilli: { type: 'integer', minimum: 1, maximum: 1_000_000_000 },
                },
              },
            },
            motivo: { type: 'string', minLength: 3, maxLength: 200, pattern: '\\S' },
            pinDueno: { type: 'string', pattern: '^[0-9]{4,8}$' },
            registerId: { type: 'string' },
          },
        },
      },
    },
    (req, reply) => {
      const usuario = req.sesion?.usuario;
      /* v8 ignore next -- requiereSesion lo garantiza */
      if (!usuario) return reply.code(401).send();
      let autorizadaPorId = usuario.id;
      if (usuario.role !== 'DUENO') {
        if (!req.body.pinDueno) {
          return reply.code(403).send({
            error: 'FALTA_CLAVE_DUENO',
            mensaje: 'Para devolver se necesita la clave del dueño',
          });
        }
        const a = autorizarDueno(db, intentos, req.body.pinDueno);
        if (!a.ok) return reply.code(a.estado).send(a.cuerpo);
        autorizadaPorId = a.dueno.id;
      }
      const r = registrarDevolucion(db, {
        ventaId: req.params.id,
        registerId: cajaOError(req.body.registerId).id,
        items: req.body.items,
        motivo: req.body.motivo,
        autorizadaPorId,
        usuarioId: usuario.id,
      });
      req.log.warn(
        { ventaId: req.params.id, devueltoClp: r.devolucion.totalClp, cajero: usuario.name },
        'Devolución parcial',
      );
      return reply.code(201).send(r);
    },
  );

  /** Folio que entregó la app e-Boleta del SII (modalidad PUENTE_MANUAL). Opcional. */
  app.patch<{ Params: { id: string }; Body: { folio: string } }>(
    '/sales/:id/folio-sii',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['folio'],
          additionalProperties: false,
          properties: { folio: { type: 'string', minLength: 1, maxLength: 20 } },
        },
      },
    },
    (req) =>
      registrarFolioSii(db, {
        ventaId: req.params.id,
        folio: req.body.folio,
        esDueno: req.sesion?.usuario.role === 'DUENO',
      }),
  );
}
