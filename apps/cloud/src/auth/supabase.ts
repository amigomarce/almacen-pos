import { createRemoteJWKSet, jwtVerify } from 'jose';

export type VerificadorJwt = (token: string) => Promise<{ sub: string } | null>;

export interface OpcionesJwt {
  /** URL del proyecto Supabase. Se usa para JWKS (proyectos con claves asimétricas, ES256). */
  url?: string | undefined;
  /** JWT secret legacy (HS256), para proyectos que aún firman así. */
  secreto?: string | undefined;
}

/**
 * Verifica el JWT de Supabase Auth y devuelve su `sub` (el `auth.users.id` del dueño).
 *
 * Los proyectos nuevos de Supabase firman con claves asimétricas (ES256) y publican el JWKS
 * en `<proyecto>/auth/v1/.well-known/jwks.json`; los viejos usan el "JWT secret" (HS256).
 * Se soportan ambos: si hay `url` se valida contra el JWKS; si no, con el secreto (HS256).
 */
export function crearVerificadorJwt(opciones: OpcionesJwt): VerificadorJwt {
  const base = opciones.url?.replace(/\/+$/, '');
  const jwks = base ? createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`)) : null;
  const claveHs = opciones.secreto ? new TextEncoder().encode(opciones.secreto) : null;
  const material = jwks ?? claveHs;
  const algoritmo = jwks ? { algorithms: ['ES256', 'RS256'] } : { algorithms: ['HS256'] };

  return async (token: string) => {
    if (!material) return null;
    try {
      const { payload } = await jwtVerify(token, material, algoritmo);
      return typeof payload.sub === 'string' && payload.sub !== '' ? { sub: payload.sub } : null;
    } catch {
      return null;
    }
  };
}
