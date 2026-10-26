import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requiereDispositivo } from '../auth/requerir.js';
import type { RepoInstalaciones } from '../instalaciones/servicio.js';
import type { AlmacenObjetos } from './almacen.js';
import { guardarRespaldo, sha256De, type RepoRespaldos } from './servicio.js';

export interface DependenciasRespaldos {
  repoInstalaciones: RepoInstalaciones;
  repoRespaldos: RepoRespaldos;
  /** `null` si el proyecto no tiene Storage configurado. */
  almacen: AlmacenObjetos | null;
  maxBytes?: number;
}

const MAX_POR_DEFECTO = 50 * 1024 * 1024;
const NOMBRE = /^[A-Za-z0-9._-]{1,120}\.apos$/;
const SHA256 = /^[a-f0-9]{64}$/;

function ownerDe(req: FastifyRequest): string | null {
  return req.instalacion?.ownerId ?? null;
}

/**
 * Respaldos de la caja: la caja sube un `.apos` cifrado con su token de dispositivo y puede
 * listar/descargar los suyos. El dueño no descarga desde acá todavía; la restauración se hace
 * con la caja detenida (CLI) para no pisar una base en uso.
 */
export function registrarRespaldos(app: FastifyInstance, deps: DependenciasRespaldos): void {
  const maxBytes = deps.maxBytes ?? MAX_POR_DEFECTO;
  const conDispositivo = requiereDispositivo(deps.repoInstalaciones);

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: maxBytes },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post<{
    Querystring: {
      filename: string;
      sha256?: string;
      createdAt: string;
      retention: number;
    };
  }>(
    '/backups',
    {
      onRequest: conDispositivo,
      schema: {
        querystring: {
          type: 'object',
          required: ['filename', 'createdAt', 'retention'],
          additionalProperties: false,
          properties: {
            filename: { type: 'string', pattern: NOMBRE.source },
            sha256: { type: 'string', pattern: SHA256.source },
            createdAt: { type: 'string', minLength: 20, maxLength: 30 },
            retention: { type: 'integer', minimum: 1, maximum: 30 },
          },
        },
      },
    },
    async (req, reply) => {
      const ownerId = ownerDe(req);
      if (!ownerId) {
        return reply
          .code(409)
          .send({ error: 'SIN_VINCULAR', mensaje: 'Vincula la caja a tu cuenta' });
      }
      if (!deps.almacen) {
        return reply.code(503).send({
          error: 'RESPALDOS_NO_CONFIGURADOS',
          mensaje: 'La nube no tiene Storage configurado',
        });
      }
      const body = req.body;
      if (!(body instanceof Buffer) || body.length === 0) {
        return reply.code(400).send({ error: 'RESPALDO_VACIO', mensaje: 'El respaldo está vacío' });
      }
      if (body.length > maxBytes) {
        return reply.code(413).send({
          error: 'RESPALDO_MUY_GRANDE',
          mensaje: `El respaldo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB`,
        });
      }
      const calculado = sha256De(body);
      if (req.query.sha256 && req.query.sha256 !== calculado) {
        return reply.code(400).send({
          error: 'RESPALDO_CORRUPTO',
          mensaje: 'El hash del respaldo no coincide',
        });
      }
      const fecha = new Date(req.query.createdAt);
      if (Number.isNaN(fecha.getTime())) {
        return reply
          .code(400)
          .send({ error: 'FECHA_INVALIDA', mensaje: 'La fecha del respaldo no es válida' });
      }

      const fila = await guardarRespaldo(deps.repoRespaldos, deps.almacen, {
        ownerId,
        installationId: req.instalacion?.id ?? '',
        filename: req.query.filename,
        sizeBytes: body.length,
        sha256: calculado,
        datos: body,
        createdAt: fecha,
        retention: req.query.retention,
      });
      return reply.code(201).send({
        id: fila.id,
        objeto: fila.objectKey,
        sizeBytes: fila.sizeBytes,
        sha256: fila.sha256,
        createdAt: fila.createdAt.toISOString(),
      });
    },
  );

  app.get('/backups/caja', { onRequest: conDispositivo }, async (req, reply) => {
    const ownerId = ownerDe(req);
    if (!ownerId) {
      return reply
        .code(409)
        .send({ error: 'SIN_VINCULAR', mensaje: 'Vincula la caja a tu cuenta' });
    }
    const respaldos = await deps.repoRespaldos.listar(ownerId, req.instalacion?.id ?? '');
    return {
      respaldos: respaldos.map((r) => ({
        id: r.id,
        filename: r.filename,
        sizeBytes: r.sizeBytes,
        sha256: r.sha256,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.get<{ Params: { id: string } }>(
    '/backups/caja/:id',
    { onRequest: conDispositivo },
    async (req, reply) => {
      const ownerId = ownerDe(req);
      if (!ownerId) {
        return reply
          .code(409)
          .send({ error: 'SIN_VINCULAR', mensaje: 'Vincula la caja a tu cuenta' });
      }
      if (!deps.almacen) {
        return reply.code(503).send({
          error: 'RESPALDOS_NO_CONFIGURADOS',
          mensaje: 'La nube no tiene Storage configurado',
        });
      }
      const fila = await deps.repoRespaldos.porId(
        ownerId,
        req.instalacion?.id ?? '',
        req.params.id,
      );
      if (!fila) {
        return reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Respaldo no encontrado' });
      }
      const datos = await deps.almacen.descargar(fila.objectKey);
      return reply
        .header('content-type', 'application/octet-stream')
        .header('content-disposition', `attachment; filename="${fila.filename}"`)
        .send(datos);
    },
  );
}
