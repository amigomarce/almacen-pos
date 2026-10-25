import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { crearVerificadorJwt } from './supabase.js';
import { SECRETO_JWT, firmarJwt } from '../test/ayudas.js';

describe('verificación de JWT de Supabase', () => {
  it('devuelve el sub de un token válido', async () => {
    const token = await firmarJwt('dueno-1');
    await expect(crearVerificadorJwt(SECRETO_JWT)(token)).resolves.toEqual({ sub: 'dueno-1' });
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = await firmarJwt('dueno-1', 'otro-secreto-distinto-del-nuestro');
    await expect(crearVerificadorJwt(SECRETO_JWT)(token)).resolves.toBeNull();
  });

  it('rechaza texto que no es un JWT', async () => {
    await expect(crearVerificadorJwt(SECRETO_JWT)('no-es-un-jwt')).resolves.toBeNull();
  });

  it('rechaza un token sin sub', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(SECRETO_JWT));
    await expect(crearVerificadorJwt(SECRETO_JWT)(token)).resolves.toBeNull();
  });
});
