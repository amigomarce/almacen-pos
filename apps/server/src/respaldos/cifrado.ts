import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErrorDominio } from '@almacen/core';

/**
 * Cifrado de los respaldos que se suben a la nube.
 *
 * El paquete se cifra con una clave local de 32 bytes (`respaldo.key`), separada de la del
 * SII. La clave **no se sube**: el dueño debe guardarla para poder restaurar. Si pierde la
 * clave y el equipo, los respaldos remotos no se pueden abrir.
 */

export const LARGO_CLAVE_RESPALDO = 32;
const MAGIC = Buffer.from('APOSBK01', 'ascii');
const IV = 12;
const TAG = 16;

export function leerClaveRespaldo(ruta: string): Buffer {
  if (existsSync(ruta)) {
    const clave = readFileSync(ruta);
    if (clave.length !== LARGO_CLAVE_RESPALDO) {
      throw new ErrorDominio(
        'CLAVE_RESPALDO_INVALIDA',
        `La clave de respaldo debe tener ${LARGO_CLAVE_RESPALDO} bytes (${ruta})`,
      );
    }
    return clave;
  }
  mkdirSync(dirname(ruta), { recursive: true });
  const clave = randomBytes(LARGO_CLAVE_RESPALDO);
  writeFileSync(ruta, clave, { mode: 0o600 });
  chmodSync(ruta, 0o600);
  return clave;
}

export function claveRespaldoABase64(clave: Buffer): string {
  return clave.toString('base64url');
}

export function claveRespaldoDesdeBase64(texto: string): Buffer {
  const clave = Buffer.from(texto.trim(), 'base64url');
  if (clave.length !== LARGO_CLAVE_RESPALDO) {
    throw new ErrorDominio(
      'CLAVE_RESPALDO_INVALIDA',
      `La clave de respaldo debe tener ${LARGO_CLAVE_RESPALDO} bytes`,
    );
  }
  return clave;
}

/** Formato binario: `APOSBK01` + IV + tag + ciphertext (AES-256-GCM). */
export function cifrarPaquete(datos: Buffer, clave: Buffer): Buffer {
  if (clave.length !== LARGO_CLAVE_RESPALDO) {
    throw new ErrorDominio('CLAVE_RESPALDO_INVALIDA', 'La clave de respaldo no es válida');
  }
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([cipher.update(datos), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), cifrado]);
}

export function descifrarPaquete(datos: Buffer, clave: Buffer): Buffer {
  if (clave.length !== LARGO_CLAVE_RESPALDO) {
    throw new ErrorDominio('CLAVE_RESPALDO_INVALIDA', 'La clave de respaldo no es válida');
  }
  if (datos.length < MAGIC.length + IV + TAG || !datos.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new ErrorDominio('RESPALDO_CIFRADO_INVALIDO', 'El archivo no es un respaldo de Almacén');
  }
  const iv = datos.subarray(MAGIC.length, MAGIC.length + IV);
  const tag = datos.subarray(MAGIC.length + IV, MAGIC.length + IV + TAG);
  const cifrado = datos.subarray(MAGIC.length + IV + TAG);
  try {
    const decipher = createDecipheriv('aes-256-gcm', clave, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]);
  } catch {
    throw new ErrorDominio(
      'RESPALDO_NO_DESCIFRA',
      'No se pudo descifrar el respaldo: la clave no corresponde o el archivo está dañado',
    );
  }
}
