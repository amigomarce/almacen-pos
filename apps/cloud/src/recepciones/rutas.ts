import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requiereDueno } from '../auth/requerir.js';
import type { VerificadorJwt } from '../auth/supabase.js';
import { registrarRecepcion, type LineaRecepcion, type RepoRecepciones } from './servicio.js';

export interface DependenciasRecepciones {
  repo: RepoRecepciones;
  verificarJwt: VerificadorJwt;
}

function duenoDe(req: FastifyRequest, reply: FastifyReply): string | null {
  if (req.duenoId) return req.duenoId;
  reply.code(401).send({ error: 'NO_AUTENTICADO', mensaje: 'Inicia sesión en la app' });
  return null;
}

export function registrarRecepciones(
  app: FastifyInstance,
  { repo, verificarJwt }: DependenciasRecepciones,
): void {
  const conDueno = requiereDueno(verificarJwt);

  /** Recepción de mercadería desde el móvil: suma stock y baja el movimiento a la caja. */
  app.post<{ Body: { lineas: LineaRecepcion[] } }>(
    '/receptions',
    {
      onRequest: conDueno,
      schema: {
        body: {
          type: 'object',
          required: ['lineas'],
          additionalProperties: false,
          properties: {
            lineas: {
              type: 'array',
              minItems: 1,
              maxItems: 300,
              items: {
                type: 'object',
                required: ['productId', 'cantidadMilli'],
                additionalProperties: false,
                properties: {
                  productId: { type: 'string', minLength: 1, maxLength: 64 },
                  cantidadMilli: { type: 'integer', minimum: 1, maximum: 1_000_000_000 },
                  costoUnitarioClp: { type: 'integer', minimum: 0, maximum: 100_000_000 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const ownerId = duenoDe(req, reply);
      if (!ownerId) return;
      const r = await registrarRecepcion(repo, {
        ownerId,
        lineas: req.body.lineas,
        ahora: new Date(),
      });
      if (!r.ok) {
        return reply
          .code(404)
          .send({ error: 'PRODUCTO_NO_ENCONTRADO', mensaje: 'Producto no encontrado' });
      }
      return reply.code(201).send(r.resultado);
    },
  );
}
