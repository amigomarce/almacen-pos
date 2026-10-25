import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { hashToken } from './dispositivos.js';
import type { VerificadorJwt } from './supabase.js';
import type { Instalacion, RepoInstalaciones } from '../instalaciones/servicio.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** `sub` del JWT de Supabase (dueño); lo llena `requiereDueno`. */
    duenoId: string | null;
    /** Instalación autenticada por token de dispositivo; la llena `requiereDispositivo`. */
    instalacion: Instalacion | null;
  }
}

function tokenDe(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

/** Exige el JWT de Supabase Auth del dueño. */
export function requiereDueno(verificarJwt: VerificadorJwt): onRequestAsyncHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = tokenDe(req);
    const dueno = token ? await verificarJwt(token) : null;
    if (!dueno) {
      return reply
        .code(401)
        .send({ error: 'NO_AUTENTICADO', mensaje: 'Inicia sesión en la app del dueño' });
    }
    req.duenoId = dueno.sub;
  };
}

/** Exige el token de dispositivo de una caja registrada. */
export function requiereDispositivo(repo: RepoInstalaciones): onRequestAsyncHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = tokenDe(req);
    const instalacion = token ? await repo.porTokenHash(hashToken(token)) : null;
    if (!instalacion) {
      return reply
        .code(401)
        .send({ error: 'DISPOSITIVO_DESCONOCIDO', mensaje: 'Caja no registrada en la nube' });
    }
    req.instalacion = instalacion;
  };
}
