import { Buffer } from 'node:buffer';
import { createHash, createSign, X509Certificate } from 'node:crypto';
import { ErrorDominio } from '@almacen/core';
import type { CertificadoFirma } from './tipos.js';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVOLVENTE = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';

/** Transformada aplicada a la referencia antes de calcular el digest. */
export type TransformadaFirma = 'c14n' | 'envolvente';

export interface OpcionesFirma {
  /**
   * Valor del atributo `URI` de `<Reference>`: `#ID` para firmar un elemento con
   * `xs:ID`, o `""` para firmar el documento completo (firma envolvente).
   */
  referencia: string;
  /** Forma canónica del documento o subárbol que se firma, en UTF-8. */
  canonico: string;
  certificado: CertificadoFirma;
  /** `c14n` (por defecto) o `envolvente` (el SII la exige para el token). */
  transformada?: TransformadaFirma;
}

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

function validarReferencia(referencia: string): void {
  if (referencia !== '' && !/^#[A-Za-z_][A-Za-z0-9._-]*$/.test(referencia)) {
    throw new ErrorDominio('REFERENCIA_INVALIDA', `Referencia XMLDSig inválida: "${referencia}"`);
  }
}

/**
 * Firma XMLDSig genérica (RSA-SHA1 + SHA1 + C14N), con la forma que exige el SII:
 * `KeyInfo` con `RSAKeyValue` y `X509Data/X509Certificate`.
 *
 * - `DigestValue`: SHA1 sobre la forma canónica (C14N) del subárbol referenciado.
 * - `SignatureValue`: RSA-SHA1 sobre la forma canónica de `<SignedInfo>`.
 *
 * Para el DTE de boleta la referencia es `#ID` con transformada C14N. Para el token del
 * SII la referencia es `""` con transformada enveloped-signature. Ver ADR-008 y ADR-009.
 */
export function firmarXml(opciones: OpcionesFirma): string {
  const { referencia, canonico, certificado } = opciones;
  validarReferencia(referencia);

  const transformada = opciones.transformada ?? 'c14n';
  const algoritmoTransform = transformada === 'envolvente' ? ENVOLVENTE : C14N;
  const digest = createHash('sha1').update(Buffer.from(canonico, 'utf8')).digest('base64');

  // Forma canónica de <SignedInfo> (etiquetas pares y xmlns explícito), que es lo que se firma.
  const signedInfoCanonico =
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${RSA_SHA1}"></SignatureMethod>` +
    `<Reference URI="${referencia}"><Transforms><Transform Algorithm="${algoritmoTransform}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${SHA1}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>` +
    `</SignedInfo>`;

  const firma = createSign('RSA-SHA1')
    .update(Buffer.from(signedInfoCanonico, 'utf8'))
    .end()
    .sign(certificado.clavePrivadaPem, 'base64');

  const { modulo, exponente, certificadoB64 } = datosCertificado(certificado.certificadoPem);

  // Forma literal que se incrusta en el documento. Se usan etiquetas pares (no
  // autocerradas) para que coincida con la forma canónica C14N: C14N expande `<x/>` a
  // `<x></x>`, y el digest del `<SetDTE>` se calcula sobre el documento ya incrustado.
  const signedInfoLiteral =
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${RSA_SHA1}"></SignatureMethod>` +
    `<Reference URI="${referencia}"><Transforms><Transform Algorithm="${algoritmoTransform}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${SHA1}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>` +
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

/**
 * Firma XMLDSig del elemento `<Documento>` referenciado por su `ID`.
 *
 * El `<Documento>` no tiene namespace propio (hereda el del `<DTE>`), así que su C14N
 * declara el namespace en el nodo raíz de la referencia. Se firma esa forma, no la literal.
 * Ver ADR-008.
 */
export function firmarDocumento(
  id: string,
  documentoCanonico: string,
  certificado: CertificadoFirma,
): string {
  return firmarXml({ referencia: `#${id}`, canonico: documentoCanonico, certificado });
}

/**
 * Firma envolvente del documento completo (la que exige el SII para el token).
 *
 * El digest se calcula sobre `documentoCanonico` (el documento **sin** la firma); al
 * insertar el `<Signature>` dentro del elemento raíz, la transformada
 * `enveloped-signature` lo excluye y el digest vuelve a coincidir.
 */
export function firmarEnvolvente(documentoCanonico: string, certificado: CertificadoFirma): string {
  return firmarXml({
    referencia: '',
    canonico: documentoCanonico,
    certificado,
    transformada: 'envolvente',
  });
}
