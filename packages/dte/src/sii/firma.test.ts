import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { firmarDocumento } from './firma.js';
import { CERTIFICADO_PEM, CLAVE_PRIVADA_PEM, signedInfoCanonico } from './test/ayudas.js';

const ID = 'T39F1';
const DOCUMENTO = '<Documento ID="T39F1"><Encabezado></Encabezado><Detalle></Detalle></Documento>';

describe('firma XMLDSig', () => {
  const firma = firmarDocumento(ID, DOCUMENTO, {
    certificadoPem: CERTIFICADO_PEM,
    clavePrivadaPem: CLAVE_PRIVADA_PEM,
  });

  it('incluye los elementos esperados', () => {
    expect(firma).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(firma).toContain('<SignatureValue>');
    expect(firma).toContain('<X509Certificate>');
    expect(firma).toContain(`<Reference URI="#${ID}">`);
  });

  it('calcula el DigestValue como SHA1 del Documento (UTF-8)', () => {
    const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(firma)?.[1];
    expect(digest).toBe(createHash('sha1').update(Buffer.from(DOCUMENTO, 'utf8')).digest('base64'));
  });

  it('la SignatureValue verifica contra el SignedInfo canónico', () => {
    const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(firma)?.[1];
    const sig = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firma)?.[1];
    if (!digest || !sig) throw new Error('firma sin digest o signature');

    const ok = verify(
      'RSA-SHA1',
      Buffer.from(signedInfoCanonico(ID, digest), 'utf8'),
      createPublicKey(CERTIFICADO_PEM),
      Buffer.from(sig, 'base64'),
    );
    expect(ok).toBe(true);
  });
});
