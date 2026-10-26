import { Buffer } from 'node:buffer';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';

/**
 * Ayudas de prueba. Todo aquí es sintético y descartable (CLAUDE.md §3: nunca usar
 * credenciales reales). El certificado es autofirmado y solo sirve para los tests.
 */

export const CERTIFICADO_PEM = `-----BEGIN CERTIFICATE-----
MIIDBjCCAe4CCQCH3lBIAvDnAjANBgkqhkiG9w0BAQsFADBFMRowGAYDVQQDDBFB
bG1hY2VuIGRlIFBydWViYTELMAkGA1UEBhMCQ0wxGjAYBgNVBAoMEUFsbWFjZW4g
ZGUgQmFycmlvMB4XDTI2MTAyNjAwMDcxN1oXDTM2MTAyMzAwMDcxN1owRTEaMBgG
A1UEAwwRQWxtYWNlbiBkZSBQcnVlYmExCzAJBgNVBAYTAkNMMRowGAYDVQQKDBFB
bG1hY2VuIGRlIEJhcnJpbzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AM92Je4xhFl2g6nqwZ8htpH/JhhRMo8WO45lOfdLLA2GmDi/v7uMTH8Fur57eavI
15Hjy4nf3tmCttR3cuQVEIe0n8UCUc/fJvYdxkJghFFyr2n8zkTgC+qMTPbnKyTm
04uzmmMbIcvut/WPXAJVH1ExMpySklTDDjA/lXaC3IVQsg7sf5HWEmULfPHGmp2O
iJoVuoimcqfa1r0k4NCCG6P9YJJqdIyUgd6d9sVnWEpQoro5OQeKPNzCx7u4WTmG
GpR5b1IQLLR3aYw/VEoOlAo3QPLCTx1lu5al3NpBU5lhFF++yBaoLQY9dA/rcTdQ
L6N/1srVL/k5QA5M+Qo3TX0CAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAZeWfGZCP
Thkk75MfE7mqhGCALV4904nc+wZZLtxTkiEwKf8DUzbdY1y3WcbAXAJNpStJKQGl
M5qTneLsOwi4SuHO2YnxZmmTtom9DcewfTmUpTAMkY5xB/kHX946495/8YmIN1St
jhefYFrTyT3wATeeK9ynN3ReOXDccugXh25oe1okTW2ox9J6F0X6izmICfsRXrC7
n0uHCgucbtGPysbZVMC5dAZmL76tmxG6mgACi1alwnVjkcOX7eKWW0SUpvzw1lJQ
PPiowWVAu2XfNq10+JmxGbrN/k1SHj/DbEjQWd6skRx9mC9U8oRt3K0k4DZC4qK/
UXNHQw+fxqEzRw==
-----END CERTIFICATE-----`;

export const CLAVE_PRIVADA_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpgIBAAKCAQEAz3Yl7jGEWXaDqerBnyG2kf8mGFEyjxY7jmU590ssDYaYOL+/
u4xMfwW6vnt5q8jXkePLid/e2YK21Hdy5BUQh7SfxQJRz98m9h3GQmCEUXKvafzO
ROAL6oxM9ucrJObTi7OaYxshy+639Y9cAlUfUTEynJKSVMMOMD+VdoLchVCyDux/
kdYSZQt88caanY6ImhW6iKZyp9rWvSTg0IIbo/1gkmp0jJSB3p32xWdYSlCiujk5
B4o83MLHu7hZOYYalHlvUhAstHdpjD9USg6UCjdA8sJPHWW7lqXc2kFTmWEUX77I
FqgtBj10D+txN1Avo3/WytUv+TlADkz5CjdNfQIDAQABAoIBAQC3Yl23BshR+IP8
EAqlKrzioyK+fg/uEZ4Fig9KPIWtUxt9lmnaU/NOmPbw596ubfO3/x9tOZoYtQX+
G7RQTxp0isJr+FfvIveiuMEG7aApCvJqAtEmatG9u9VQrxkhHnVC2TkQf+xJAzRT
eSzA1xO+xnlRk/KLwHvrRFlPD+/0Wr8VKPTAvXzUnSH8CgokTfqDyAC0l2YX3qSq
gRUOVu524/gnwcslcyGThLiWe7HNI3fykPeqHb1sG+ixTb1uZfUGufNkYZhmL3vM
L/MML8l/EyihuxyioL1OqxdQMzRqjjM+R8iP1SR+QR8Ei2T7G4LC7PaBztVVW7h0
sMhU8qLVAoGBAPbo7WycVYnfl2Q4WHT8Q/rDYmJHfpcPuNeDYva67FJdIypZb3xC
kDhoVZEEaXfDVrVGu/k6nLl/JVfycdguQynK3er6jHYov4L13QAetT98fxBopin8
hyse9RYWQ/8CoLI4RLWEXknpLpR0CDw0sOkuS3n+D7p9LCmwUf0WisG/AoGBANcZ
ba3JQwxrsMtENwA4pKaEBbNPkxiljNoGgITQxGz+mVgoXW0/Pw0nAzd+jfD2Yj5G
gPJrC0Xn/Lv/CSEKHYAhMXNM73NS+5HZZCqDx3+k9NViQXL0FKY9B8G1esMvfSO9
6Pgkjlq/queOTTIXaWBsF/tAGAGTktAlhqcQJofDAoGBANQ66rmMt0nHUs3mUMJd
g+EryIlJgto9vVghqxMBINi7Ddr8/QMGBAk4RTRdYnp7ATDYGALmCoi3bVXnI0v6
l+h4Y7/ylIGMDPF4e/n6aziivmVQTmOQmG7MMUZG5TNxAset7gFIQfOt50fbZKi7
ccU88ctuQf6+UROUZyTwF1zpAoGBAI9tkUj0jxTVKkof7lzjaEbweaybPwaMPWOU
OlZVruTO0AmMwN978NsgTHDQnm0ynUfRU2JSJm4yxr/Ey52QVSN+/q5XesN3bfBO
+Q+wV3Kx1+ABaIryXmKLB4UPMhC8tcEDfTkZhyLT82374VWpbsawzTzn/BnxAVBx
9Vuo1UhpAoGBAIoqmYWRzkpGSRRPjGxSnFwzkA9rG2gN6fsV4T1lhuBS3xsECukx
ptn9CErfIzxlguFPyHM1i0uJgW8UI3wAR0QLzjM8iWHDkBd+19eK+6gl8lNWqHut
xbBVpuhH5mG+Hu4WkXPH+bvlwpu0YLtAz5qry4mnNgOzaiOpdW1FQyzr
-----END RSA PRIVATE KEY-----`;

export function base64urlABase64(v: string): string {
  const b64 = v.replaceAll('-', '+').replaceAll('_', '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';

/** Forma canónica de <SignedInfo> (la que se firma), para verificar en los tests. */
export function signedInfoCanonico(id: string, digest: string): string {
  return (
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${RSA_SHA1}"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms><Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${SHA1}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>` +
    `</SignedInfo>`
  );
}

export interface OpcionesCafPrueba {
  tipoDte?: 39 | 41;
  desde?: number;
  hasta?: number;
  rut?: string;
  razonSocial?: string;
}

export interface CafPrueba {
  xml: string;
  clavePrivadaPem: string;
  clavePublica: KeyObject;
}

/** Genera un archivo de autorización (CAF) sintético con una llave RSA real. */
export function generarCafPrueba(opciones: OpcionesCafPrueba = {}): CafPrueba {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const clavePrivadaPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
  const m = base64urlABase64(jwk.n);
  const e = base64urlABase64(jwk.e);

  const desde = opciones.desde ?? 1;
  const hasta = opciones.hasta ?? 100;
  const rut = opciones.rut ?? '76.086.428-5';
  const razonSocial = opciones.razonSocial ?? 'ALMACEN DE PRUEBA';
  const tipoDte = opciones.tipoDte ?? 39;

  const da =
    `<RE>${rut}</RE>` +
    `<RS>${razonSocial}</RS>` +
    `<TD>${tipoDte}</TD>` +
    `<RNG><D>${desde}</D><H>${hasta}</H></RNG>` +
    `<FA>2026-01-01</FA>` +
    `<RSAPK><M>${m}</M><E>${e}</E></RSAPK>` +
    `<IDK>100</IDK>`;
  const frma = Buffer.from('firma-caf-de-prueba').toString('base64');
  const xml =
    `<AUTORIZACION>` +
    `<CAF version="1.0"><DA>${da}</DA><FRMA algoritmo="SHA1withRSA">${frma}</FRMA></CAF>` +
    `<RSASK>${clavePrivadaPem}</RSASK>` +
    `</AUTORIZACION>`;

  return { xml, clavePrivadaPem, clavePublica: publicKey };
}
