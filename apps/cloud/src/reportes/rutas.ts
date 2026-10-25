import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requiereDueno } from '../auth/requerir.js';
import type { VerificadorJwt } from '../auth/supabase.js';
import type { RepoReportes } from './servicio.js';

export interface DependenciasReportes {
  repo: RepoReportes;
  verificarJwt: VerificadorJwt;
}

function duenoDe(req: FastifyRequest, reply: FastifyReply): string | null {
  if (req.duenoId) return req.duenoId;
  reply.code(401).send({ error: 'NO_AUTENTICADO', mensaje: 'Inicia sesión en la app' });
  return null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function registrarReportes(
  app: FastifyInstance,
  { repo, verificarJwt }: DependenciasReportes,
): void {
  const conDueno = requiereDueno(verificarJwt);

  // TODO: "hoy" según la hora del local (Chile); por ahora las últimas 24 h.
  app.get('/report/sales/today', { onRequest: conDueno }, async (req, reply) => {
    const ownerId = duenoDe(req, reply);
    if (!ownerId) return;
    return repo.resumenVentas(ownerId, new Date(Date.now() - DIA_MS));
  });

  app.get('/report/stock-bajo', { onRequest: conDueno }, async (req, reply) => {
    const ownerId = duenoDe(req, reply);
    if (!ownerId) return;
    return repo.stockBajo(ownerId);
  });
}
