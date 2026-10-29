import { inicioDelDia } from '@almacen/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requiereDueno } from '../auth/requerir.js';
import type { VerificadorJwt } from '../auth/supabase.js';
import { analizarVentas, inicioPeriodo } from './analisis.js';
import { resumirFiado } from './fiado.js';
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

export function registrarReportes(
  app: FastifyInstance,
  { repo, verificarJwt }: DependenciasReportes,
): void {
  const conDueno = requiereDueno(verificarJwt);

  // "Hoy" según el reloj de Chile (desde las 00:00 locales), aunque la nube corra en UTC.
  app.get('/report/sales/today', { onRequest: conDueno }, async (req, reply) => {
    const ownerId = duenoDe(req, reply);
    if (!ownerId) return;
    return repo.resumenVentas(ownerId, inicioDelDia(new Date()));
  });

  /**
   * Reportes del dueño: ventas netas, más vendidos con margen, ventas por hora y por día y
   * sugerido de compra. `dias`: 1 (hoy), 7 o 30, contados en días de Chile.
   */
  app.get<{ Querystring: { dias?: 1 | 7 | 30 } }>(
    '/report/summary',
    {
      onRequest: conDueno,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { dias: { type: 'integer', enum: [1, 7, 30] } },
        },
      },
    },
    async (req, reply) => {
      const ownerId = duenoDe(req, reply);
      if (!ownerId) return;
      const dias = req.query.dias ?? 7;
      const ahora = new Date();
      const datos = await repo.datosReporte(ownerId, inicioPeriodo(dias, ahora));
      return analizarVentas({ dias, ahora, ...datos });
    },
  );

  /** Fiado: quién debe y cuánto (ADR-022). */
  app.get('/report/fiado', { onRequest: conDueno }, async (req, reply) => {
    const ownerId = duenoDe(req, reply);
    if (!ownerId) return;
    const { clientes, movimientos } = await repo.datosFiado(ownerId);
    return resumirFiado(clientes, movimientos);
  });

  app.get('/report/stock-bajo', { onRequest: conDueno }, async (req, reply) => {
    const ownerId = duenoDe(req, reply);
    if (!ownerId) return;
    return repo.stockBajo(ownerId);
  });

  // Aviso de cierre de caja en el móvil (sin push): el último cierre que subió la caja.
  app.get('/report/cash-closes', { onRequest: conDueno }, async (req, reply) => {
    const ownerId = duenoDe(req, reply);
    if (!ownerId) return;
    return { cierre: await repo.ultimoCierre(ownerId) };
  });
}
