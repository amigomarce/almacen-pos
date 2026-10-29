import { aTexto, ticketCierre, ticketPrueba, ticketVenta, type Documento } from '@almacen/printer';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import { buscarCaja, sesionPorId } from '../caja/servicio.js';
import { leerConfiguracion } from '../configuracion/servicio.js';
import type { Db } from '../db/client.js';
import { TRANSPORTES_IMPRESORA } from '../db/schema.js';
import { ErrorHttp } from '../errores.js';
import { obtenerVenta } from '../ventas/servicio.js';
import {
  ANCHOS_PAPEL,
  columnasEfectivas,
  guardarConfigImpresora,
  leerConfigImpresora,
  PAGINAS_CODIGOS,
  type ConfigImpresora,
} from './config.js';
import type { ServicioImpresion } from './servicio.js';
import { ErrorImpresion, listarColasSistema, type Ejecutar } from './transportes.js';

export interface DependenciasImpresion {
  db: Db;
  sesiones: Sesiones;
  impresion: ServicioImpresion;
  /** Para listar colas del sistema en tests. */
  ejecutar?: Ejecutar;
}

const ESQUEMA_CONFIG = {
  type: 'object',
  required: ['transporte', 'anchoMm', 'paginaCodigos', 'cortar', 'abrirCajon'],
  additionalProperties: false,
  properties: {
    registerId: { type: 'string' },
    transporte: { type: 'string', enum: [...TRANSPORTES_IMPRESORA] },
    destino: { type: ['string', 'null'], maxLength: 200 },
    anchoMm: { type: 'integer', enum: [...ANCHOS_PAPEL] },
    columnas: { type: ['integer', 'null'], minimum: 16, maximum: 64 },
    paginaCodigos: { type: 'string', enum: [...PAGINAS_CODIGOS] },
    cortar: { type: 'boolean' },
    abrirCajon: { type: 'boolean' },
  },
} as const;

export function registrarImpresion(app: FastifyInstance, deps: DependenciasImpresion): void {
  const { db, sesiones, impresion } = deps;
  const conSesion = requiereSesion(sesiones);
  const soloDueno = requiereSesion(sesiones, ['DUENO']);

  const caja = (registerId?: string) => {
    const c = buscarCaja(db, registerId);
    if (!c) throw new ErrorHttp('CAJA_NO_ENCONTRADA', 'No hay una caja activa', 404);
    return c;
  };

  const local = () => {
    const c = leerConfiguracion(db);
    return {
      razonSocial: c.razonSocial,
      rut: c.rut,
      giro: c.giro,
      direccion: c.direccion,
      comuna: c.comuna,
    };
  };

  /** Resolución con la que se emiten las boletas (solo si el local ya tiene SII configurado). */
  const resolucionSii = () => {
    const c = leerConfiguracion(db);
    return c.siiNroResol !== null && c.siiFchResol
      ? { numero: c.siiNroResol, fecha: c.siiFchResol }
      : null;
  };

  /** Imprime y responde; si la impresora falla, 503 con la vista previa igual. */
  const imprimir = async (
    reply: FastifyReply,
    registerId: string,
    config: ConfigImpresora,
    doc: Documento,
  ) => {
    try {
      return await impresion.imprimir(registerId, config, doc);
    } catch (e) {
      if (!(e instanceof ErrorImpresion)) throw e;
      return reply.code(503).send({
        error: 'IMPRESORA_NO_RESPONDE',
        mensaje: `${e.message}. Revisa que esté encendida, conectada y con papel.`,
        vistaPrevia: aTexto(doc, config.paginaCodigos),
      });
    }
  };

  app.get<{ Querystring: { registerId?: string } }>('/printer', { onRequest: conSesion }, (req) => {
    const c = caja(req.query.registerId);
    const config = leerConfigImpresora(db, c.id);
    return { caja: c, ...config, columnasEfectivas: columnasEfectivas(config) };
  });

  app.put<{ Body: ConfigImpresora & { registerId?: string } }>(
    '/printer',
    { onRequest: soloDueno, schema: { body: ESQUEMA_CONFIG } },
    (req) => {
      const c = caja(req.body.registerId);
      const { registerId: _registerId, ...datos } = req.body;
      const config = guardarConfigImpresora(db, c.id, {
        ...datos,
        destino: datos.destino ?? null,
        columnas: datos.columnas ?? null,
      });
      return { caja: c, ...config, columnasEfectivas: columnasEfectivas(config) };
    },
  );

  /** Impresoras instaladas en el equipo (para la conexión "SISTEMA"). */
  app.get('/printer/system-queues', { onRequest: soloDueno }, async () => ({
    colas: await listarColasSistema(deps.ejecutar ? { ejecutar: deps.ejecutar } : {}),
  }));

  app.post<{ Body: { registerId?: string; abrirCajon?: boolean } | undefined }>(
    '/printer/test',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { registerId: { type: 'string' }, abrirCajon: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const c = caja(req.body?.registerId);
      const config = leerConfigImpresora(db, c.id);
      const doc = ticketPrueba({
        columnas: columnasEfectivas(config),
        paginaCodigos: config.paginaCodigos,
        anchoMm: config.anchoMm,
        abrirCajon: (req.body?.abrirCajon ?? false) && config.abrirCajon,
      });
      return imprimir(reply, c.id, config, doc);
    },
  );

  /** Abre el cajón sin vender (para dar sencillo, por ejemplo). Solo el dueño. */
  app.post<{ Body: { registerId?: string } | undefined }>(
    '/printer/drawer',
    { onRequest: soloDueno },
    async (req, reply) => {
      const c = caja(req.body?.registerId);
      const config = leerConfigImpresora(db, c.id);
      if (!config.abrirCajon) {
        return reply.code(409).send({
          error: 'CAJON_DESACTIVADO',
          mensaje: 'El cajón está desactivado en la configuración',
        });
      }
      try {
        const abierto = await impresion.abrirCajon(c.id, config);
        req.log.warn({ usuario: req.sesion?.usuario.name }, 'Cajón abierto sin venta');
        return { abierto };
      } catch (e) {
        if (!(e instanceof ErrorImpresion)) throw e;
        return reply.code(503).send({ error: 'IMPRESORA_NO_RESPONDE', mensaje: e.message });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { reimpresion?: boolean } | undefined }>(
    '/sales/:id/print',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { reimpresion: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const v = await obtenerVenta(db, req.params.id);
      if (!v)
        return reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Venta no encontrada' });
      const config = leerConfigImpresora(db, v.registerId);
      const doc = ticketVenta(
        {
          local: local(),
          numero: v.numero,
          fecha: new Date(v.creadaEn),
          cajero: v.cajero.name,
          lineas: v.lineas,
          totalClp: v.totalClp,
          redondeoClp: v.redondeoClp,
          totalCobradoClp: v.totalCobradoClp,
          medioPago: v.medioPago,
          pagadoClp: v.pagadoClp,
          vueltoClp: v.vueltoClp,
          exentoClp: v.totales.exentoClp,
          netoClp: v.totales.netoClp,
          ivaClp: v.totales.ivaClp,
          tasaIva: v.totales.tasaIva,
          documento: v.documento,
          resolucion: resolucionSii(),
          motivoSinDocumento: v.motivoSinDocumento,
          anulada: v.estado === 'ANULADA',
          reimpresion: req.body?.reimpresion ?? false,
          abrirCajon: config.abrirCajon,
        },
        columnasEfectivas(config),
      );
      return imprimir(reply, v.registerId, config, doc);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cash/sessions/:id/print',
    { onRequest: conSesion },
    async (req, reply) => {
      const r = sesionPorId(db, req.params.id);
      if (!r)
        return reply
          .code(404)
          .send({ error: 'NO_ENCONTRADO', mensaje: 'Sesión de caja no encontrada' });
      const { sesion, resumen } = r;
      if (
        !sesion.cerradaEn ||
        sesion.efectivoContadoClp === null ||
        sesion.diferenciaClp === null
      ) {
        return reply.code(409).send({ error: 'CAJA_ABIERTA', mensaje: 'Primero cierra la caja' });
      }
      const config = leerConfigImpresora(db, sesion.registerId);
      const doc = ticketCierre(
        {
          local: local(),
          caja: buscarCaja(db, sesion.registerId)?.name ?? 'Caja',
          abiertaEn: new Date(sesion.abiertaEn),
          abiertaPor: sesion.abiertaPor.name,
          cerradaEn: new Date(sesion.cerradaEn),
          cerradaPor: sesion.cerradaPor?.name ?? '?',
          // Para reimprimir igual que al cerrar: el esperado congelado manda.
          resumen: {
            ...resumen,
            efectivoEsperadoClp: sesion.efectivoEsperadoClp ?? resumen.efectivoEsperadoClp,
          },
          efectivoContadoClp: sesion.efectivoContadoClp,
          diferenciaClp: sesion.diferenciaClp,
          movimientos: r.movimientos.map(({ tipo, montoClp, motivo }) => ({
            tipo,
            montoClp,
            motivo,
          })),
        },
        columnasEfectivas(config),
      );
      return imprimir(reply, sesion.registerId, config, doc);
    },
  );
}
