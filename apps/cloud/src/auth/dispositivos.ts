import { createHash } from 'node:crypto';

/**
 * SHA-256 en hex del token de la caja. Es lo único que se guarda en la nube (nunca el token
 * en claro); al autenticar se vuelve a hashear y se busca por `token_hash` (comparación vía
 * índice único, sin comparar cadenas).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
