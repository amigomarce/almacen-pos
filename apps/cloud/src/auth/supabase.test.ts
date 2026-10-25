import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { crearVerificadorJwt } from './supabase.js';
import { SECRETO_JWT, firmarJwt } from '../test/ayudas.js';

describe('verificación de JWT de Supabase', () => {
  it('devuelve el sub de un token válido', async () => {
    const token = await firmarJwt('dueno-1');
    await expect(crearVerificadorJwt({ secreto: SECRETO_JWT })(token)).resolves.toEqual({
      sub: 'dueno-1',
    });
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = await firmarJwt('dueno-1', 'otro-secreto-distinto-del-nuestro');
    await expect(crearVerificadorJwt({ secreto: SECRETO_JWT })(token)).resolves.toBeNull();
  });

  it('rechaza texto que no es un JWT', async () => {
    await expect(crearVerificadorJwt({ secreto: SECRETO_JWT })('no-es-un-jwt')).resolves.toBeNull();
  });

  it('rechaza un token sin sub', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(SECRETO_JWT));
    await expect(crearVerificadorJwt({ secreto: SECRETO_JWT })(token)).resolves.toBeNull();
  });

  it('valida un token ES256 contra el JWKS del proyecto', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'kid-1', alg: 'ES256', use: 'sig' };
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    try {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'kid-1' })
        .setSubject('dueno-1')
        .sign(privateKey);
      const verificar = crearVerificadorJwt({ url: 'https://proyecto.test' });
      await expect(verificar(token)).resolves.toEqual({ sub: 'dueno-1' });
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});
