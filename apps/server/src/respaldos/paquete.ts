import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { ErrorDominio } from '@almacen/core';
import { cifrarPaquete, descifrarPaquete } from './cifrado.js';

const NOMBRE_DB = 'almacen.sqlite';
const NOMBRE_CLAVE_SII = 'sii.key';
const NOMBRE_MANIFIESTO = 'respaldo.json';

export interface PaqueteCifrado {
  /** Bytes del `.apos` listos para subir. */
  datos: Buffer;
  sha256: string;
}

/**
 * Empaqueta la carpeta de un respaldo local (base, clave SII y manifiesto) en un tar.gz y lo
 * cifra. No incluye la clave de respaldo: esa se queda en el equipo y el dueño la guarda.
 */
export async function crearPaqueteCifrado(
  directorioRespaldo: string,
  clave: Buffer,
): Promise<PaqueteCifrado> {
  if (!existsSync(join(directorioRespaldo, NOMBRE_DB))) {
    throw new ErrorDominio('RESPALDO_NO_ENCONTRADO', `No existe una base en ${directorioRespaldo}`);
  }
  const archivos = [NOMBRE_MANIFIESTO, NOMBRE_DB, NOMBRE_CLAVE_SII].filter((archivo) =>
    existsSync(join(directorioRespaldo, archivo)),
  );
  const temporal = mkdtempSync(join(tmpdir(), 'almacen-paquete-'));
  try {
    const tarPath = join(temporal, 'respaldo.tar.gz');
    await tar.c({ gzip: true, cwd: directorioRespaldo, file: tarPath, portable: true }, archivos);
    const datos = cifrarPaquete(readFileSync(tarPath), clave);
    return { datos, sha256: createHash('sha256').update(datos).digest('hex') };
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

/** Descifra y extrae un `.apos` en `destino`. Se usa al restaurar desde la nube. */
export async function extraerPaqueteCifrado(
  datos: Buffer,
  clave: Buffer,
  destino: string,
): Promise<void> {
  const comprimido = descifrarPaquete(datos, clave);
  mkdirSync(destino, { recursive: true, mode: 0o700 });
  const temporal = mkdtempSync(join(tmpdir(), 'almacen-paquete-'));
  try {
    const tarPath = join(temporal, 'respaldo.tar.gz');
    writeFileSync(tarPath, comprimido, { mode: 0o600 });
    await tar.x({ file: tarPath, cwd: destino });
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}
