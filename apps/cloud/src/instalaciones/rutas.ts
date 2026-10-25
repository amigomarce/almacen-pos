import type { FastifyInstance } from 'fastify';
import { hashToken } from '../auth/dispositivos.js';
import { requiereDueno, requiereDispositivo } from '../auth/requerir.js';
import type { VerificadorJwt } from '../auth/supabase.js';
import { vincularInstalacion, type Instalacion, type RepoInstalaciones } from './servicio.js';

export interface DependenciasInstalaciones {
  repo: RepoInstalaciones;
  verificarJwt: VerificadorJwt;
}

/** Lo que se expone de una instalación: nunca el `token_hash` ni el `owner_id` crudo. */
function publica(i: Instalacion | null) {
  return i ? { id: i.id, name: i.name, ownerId: i.ownerId, linkedAt: i.linkedAt } : null;
}

export function registrarInstalaciones(
  app: FastifyInstance,
  { repo, verificarJwt }: DependenciasInstalaciones,
): void {
  app.decorateRequest('duenoId', null);
  app.decorateRequest('instalacion', null);

  const conDueno = requiereDueno(verificarJwt);
  const conDispositivo = requiereDispositivo(repo);

  /**
   * El dueño (móvil) vincula una caja escaneando su QR. El QR lleva `installationId` y
   * `deviceToken`; el token se guarda solo como hash.
   */
  app.post<{ Body: { installationId: string; deviceToken: string; name: string } }>(
    '/installations/link',
    {
      onRequest: conDueno,
      schema: {
        body: {
          type: 'object',
          required: ['installationId', 'deviceToken', 'name'],
          additionalProperties: false,
          properties: {
            installationId: { type: 'string', minLength: 1, maxLength: 64 },
            deviceToken: { type: 'string', minLength: 16, maxLength: 256 },
            name: { type: 'string', minLength: 1, maxLength: 40, pattern: '\\S' },
          },
        },
      },
    },
    async (req, reply) => {
      const duenoId = req.duenoId;
      if (!duenoId) {
        return reply
          .code(401)
          .send({ error: 'NO_AUTENTICADO', mensaje: 'Inicia sesión en la app' });
      }
      const { installationId, deviceToken, name } = req.body;
      const r = await vincularInstalacion(repo, {
        id: installationId,
        name,
        tokenHash: hashToken(deviceToken),
        ownerId: duenoId,
        linkedAt: new Date(),
      });
      if (!r.ok) {
        return reply
          .code(409)
          .send({ error: 'YA_VINCULADA', mensaje: 'Esta caja ya está vinculada a otra cuenta' });
      }
      return reply.code(r.creada ? 201 : 200).send(publica(r.instalacion));
    },
  );

  /** La caja consulta su estado de vinculación usando su token de dispositivo. */
  app.get('/installations/me', { onRequest: conDispositivo }, (req) => publica(req.instalacion));
}
