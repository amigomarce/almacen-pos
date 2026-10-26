import { Buffer } from 'node:buffer';
import { createHash, createSign, X509Certificate } from 'node:crypto';
import { ErrorDominio } from '@almacen/core';
import type { CertificadoFirma } from './tipos.js';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';

function base64urlABase64(v: string): string {
  const b64 = v.replaceAll('-', '+').replaceAll('_', '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

function datosCertificado(certPem: string): {
  modulo: string;
  exponente: string;
  certificadoB64: string;
} {
  const x509 = new X509Certificate(certPem);
  const jwk = x509.publicKey.export({ format: 'jwk' }) as { n?: string; e?: string };
  if (!jwk.n || !jwk.e) {
    throw new ErrorDominio('CERTIFICADO_SIN_RSA', 'El certificado no tiene clave pública RSA');
  }
  return {
    modulo: base64urlABase64(jwk.n),
    exponente: base64urlABase64(jwk.e),
    certificadoB64: x509.raw.toString('base64'),
  };
}

/**
 * Firma XMLDSig del elemento `<Documento>` referenciado por su `ID`.
 *
 * - `DigestValue`: SHA1 sobre la forma canónica (C14N) del `<Documento>` en UTF-8.
 * - `SignatureValue`: RSA-SHA1 sobre la forma canónica de `<SignedInfo>` en UTF-8.
 *
 * El `<Documento>` no tiene namespace (el DTE interno se firma aislado), así que su C14N
 * coincide con la cadena compacta que se genera. Ver ADR-008.
 */
export function firmarDocumento(
  id: string,
  documentoCanonico: string,
  certificado: CertificadoFirma,
): string {
  const digest = createHash('sha1').update(Buffer.from(documentoCanonico, 'utf8')).digest('base64');

  // Forma canónica de <SignedInfo> (etiquetas pares y xmlns explícito), que es lo que se firma.
  const signedInfoCanonico =
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${RSA_SHA1}"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms><Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${SHA1}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>` +
    `</SignedInfo>`;

  const firma = createSign('RSA-SHA1')
    .update(Buffer.from(signedInfoCanonico, 'utf8'))
    .end()
    .sign(certificado.clavePrivadaPem, 'base64');

  const { modulo, exponente, certificadoB64 } = datosCertificado(certificado.certificadoPem);

  // Forma literal (etiquetas autocerradas) que se incrusta en el DTE.
  const signedInfoLiteral =
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="${C14N}"/>` +
    `<SignatureMethod Algorithm="${RSA_SHA1}"/>` +
    `<Reference URI="#${id}"><Transforms><Transform Algorithm="${C14N}"/></Transforms>` +
    `<DigestMethod Algorithm="${SHA1}"/><DigestValue>${digest}</DigestValue></Reference>` +
    `</SignedInfo>`;

  return (
    `<Signature xmlns="${NS_DSIG}">` +
    signedInfoLiteral +
    `<SignatureValue>${firma}</SignatureValue>` +
    `<KeyInfo><KeyValue><RSAKeyValue><Modulus>${modulo}</Modulus><Exponent>${exponente}</Exponent></RSAKeyValue></KeyValue>` +
    `<X509Data><X509Certificate>${certificadoB64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}
