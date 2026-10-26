import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErrorDominio } from '@almacen/core';
import { variable } from '../env.js';

/**
 * Cifrado en reposo de las credenciales del SII (certificado, clave privada y CAF).
 *
 * Los secretos nunca se guardan en claro ni se loguean (CLAUDE.md §3). Se usa AES-256-GCM
 * con una clave local de 32 bytes que vive fuera de la base (`var/sii.key`, modo 600) o en
 * `ALMACEN_SII_KEY`. Si se pierde la clave, hay que volver a cargar certificado y CAF.
 */

const VERSION = 'v1';
const ALGORITMO = 'aes-256-gcm';
const LARGO_CLAVE = 32;
const LARGO_IV = 12;

/** Ruta de la clave local. `ALMACEN_SII_KEY` permite moverla fuera del directorio de datos. */
export function rutaClaveSii(): string {
  return variable('ALMACEN_SII_KEY') ?? 'var/sii.key';
}

/**
 * Lee la clave local; si no existe la genera con permisos 600. Nunca se imprime ni se
 * devuelve por la API.
 */
export function leerClaveSii(ruta: string = rutaClaveSii()): Buffer {
  if (existsSync(ruta)) {
    const clave = readFileSync(ruta);
    if (clave.length !== LARGO_CLAVE) {
      throw new ErrorDominio(
        'CLAVE_SII_INVALIDA',
        `La clave del SII debe tener ${LARGO_CLAVE} bytes (${ruta})`,
      );
    }
    return clave;
  }
  mkdirSync(dirname(ruta), { recursive: true });
  const clave = randomBytes(LARGO_CLAVE);
  writeFileSync(ruta, clave, { mode: 0o600 });
  chmodSync(ruta, 0o600);
  return clave;
}

/** Cifra un texto y devuelve `v1:<iv>:<tag>:<datos>` en base64. */
export function cifrar(texto: string, clave: Buffer): string {
  if (clave.length !== LARGO_CLAVE) {
    throw new ErrorDominio(
      'CLAVE_SII_INVALIDA',
      `La clave del SII debe tener ${LARGO_CLAVE} bytes`,
    );
  }
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const datos = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), datos.toString('base64')].join(
    ':',
  );
}

/**
 * Descifra un valor de `cifrar`. Acepta texto sin el prefijo `v1:` para bases antiguas o
 * cargas manuales: así una instalación no queda inutilizable si el secreto se guardó en claro.
 */
export function descifrar(valor: string, clave: Buffer): string {
  if (!valor.startsWith(`${VERSION}:`)) return valor;
  if (clave.length !== LARGO_CLAVE) {
    throw new ErrorDominio(
      'CLAVE_SII_INVALIDA',
      `La clave del SII debe tener ${LARGO_CLAVE} bytes`,
    );
  }
  const [, ivB64, tagB64, datosB64] = valor.split(':');
  if (!ivB64 || !tagB64 || !datosB64) {
    throw new ErrorDominio('SECRETO_SII_INVALIDO', 'El secreto del SII está corrupto');
  }
  try {
    const decipher = createDecipheriv(ALGORITMO, clave, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(datosB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ErrorDominio(
      'SECRETO_SII_INVALIDO',
      'No se pudo descifrar el secreto del SII (¿cambió la clave local?)',
    );
  }
}
