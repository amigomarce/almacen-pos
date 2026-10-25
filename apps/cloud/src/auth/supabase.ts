import { jwtVerify } from 'jose';

export type VerificadorJwt = (token: string) => Promise<{ sub: string } | null>;

/**
 * Verifica el JWT de Supabase Auth (HS256, firmado con el "JWT secret" del proyecto) y
 * devuelve su `sub` (el `auth.users.id` del dueño). `null` si no es válido o no tiene `sub`.
 */
export function crearVerificadorJwt(secreto: string): VerificadorJwt {
  const clave = new TextEncoder().encode(secreto);
  return async (token: string) => {
    try {
      const { payload } = await jwtVerify(token, clave, { algorithms: ['HS256'] });
      return typeof payload.sub === 'string' && payload.sub !== '' ? { sub: payload.sub } : null;
    } catch {
      return null;
    }
  };
}
