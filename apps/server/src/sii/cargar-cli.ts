/**
 * Carga el certificado digital y los CAF del SII en la base local, cifrados.
 *
 * Uso (desde `apps/server`):
 *   pnpm sii:cargar --cert cert.pem --clave clave.pem --rut-envia 76.086.428-5 \
 *     --fch-resol 2026-01-01 --nro-resol 80 --caf caf39.xml [--caf caf41.xml]
 *
 * Los secretos se leen de archivos y nunca se imprimen. El certificado debe estar en PEM;
 * si el banco/emisor lo entrega como `.pfx`, conviértelo antes con:
 *   openssl pkcs12 -in cert.pfx -out cert.pem -nodes
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ErrorDominio } from '@almacen/core';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { cargarEnvLocal, variable } from '../env.js';
import { leerClaveSii } from './cifrado.js';
import { guardarCafSii, guardarCredencialesSii, resumenSii } from './config.js';

function leerArchivo(ruta: string, etiqueta: string): string {
  try {
    return readFileSync(ruta, 'utf8');
  } catch {
    throw new ErrorDominio('ARCHIVO_NO_ENCONTRADO', `No se pudo leer ${etiqueta}: ${ruta}`);
  }
}

cargarEnvLocal();

function leerArgumentos() {
  try {
    return parseArgs({
      options: {
        cert: { type: 'string' },
        clave: { type: 'string' },
        caf: { type: 'string', multiple: true },
        'rut-envia': { type: 'string' },
        'fch-resol': { type: 'string' },
        'nro-resol': { type: 'string' },
        ambiente: { type: 'string' },
      },
    }).values;
  } catch {
    console.error(
      'Uso: pnpm sii:cargar --cert cert.pem --clave clave.pem --rut-envia RUT --fch-resol AAAA-MM-DD --nro-resol N --caf caf.xml',
    );
    process.exit(1);
  }
}

const valores = leerArgumentos();

const rutaDb = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const db = abrirDb(rutaDb);
migrar(db);
const clave = leerClaveSii();

try {
  const quiereCertificado = Boolean(valores.cert || valores.clave);
  if (quiereCertificado) {
    const cert = valores.cert;
    const clavePrivada = valores.clave;
    const rutEnvia = valores['rut-envia'];
    const fchResol = valores['fch-resol'];
    const nroResol = valores['nro-resol'];
    if (!cert || !clavePrivada) {
      throw new ErrorDominio(
        'ARGUMENTOS_INCOMPLETOS',
        'Para cargar el certificado se necesitan --cert y --clave',
      );
    }
    if (!rutEnvia || !fchResol || !nroResol) {
      throw new ErrorDominio(
        'ARGUMENTOS_INCOMPLETOS',
        'Faltan --rut-envia, --fch-resol o --nro-resol',
      );
    }
    const ambiente = valores.ambiente;
    if (ambiente !== undefined && ambiente !== 'certificacion' && ambiente !== 'produccion') {
      throw new ErrorDominio(
        'AMBIENTE_SII_INVALIDO',
        '--ambiente debe ser "certificacion" (por defecto) o "produccion"',
      );
    }
    guardarCredencialesSii(
      db,
      {
        certificadoPem: leerArchivo(cert, 'el certificado'),
        clavePrivadaPem: leerArchivo(clavePrivada, 'la clave privada'),
        rutEnvia,
        fchResol,
        nroResol: Number(nroResol),
        ...(ambiente === 'produccion' ? { ambiente: 'produccion' as const } : {}),
      },
      clave,
    );
    console.log('Certificado del SII guardado (cifrado).');
  }

  const cafs = valores.caf ?? [];
  for (const ruta of cafs) {
    const caf = guardarCafSii(db, leerArchivo(ruta, 'el CAF'), clave);
    console.log(`CAF ${caf.tipoDte} guardado: folios ${caf.folioDesde}–${caf.folioHasta}.`);
  }

  if (!quiereCertificado && cafs.length === 0) {
    throw new ErrorDominio('SIN_ARGUMENTOS', 'Indica --cert/--clave y/o al menos un --caf');
  }

  const resumen = resumenSii(db);
  console.log('');
  console.log(`Ambiente: ${resumen.ambiente ?? 'sin certificado'}`);
  console.log(`Certificado vence: ${resumen.certificadoHasta ?? '—'}`);
  for (const c of resumen.cafs) {
    console.log(
      `  DTE ${c.tipoDte}: folios ${c.desde}–${c.hasta}, siguiente ${c.siguiente} (${c.disponibles} disponibles)`,
    );
  }
  console.log('');
  if (resumen.listo) {
    console.log('El local está listo: ya puedes elegir "Boleta electrónica desde la caja".');
  } else {
    console.log(
      'Todavía falta algo: completa RUT, razón social, giro, dirección y comuna en Configuración,',
    );
    console.log('y carga el certificado y al menos un CAF con folios disponibles.');
  }
} catch (error) {
  if (error instanceof ErrorDominio) {
    console.error(`${error.codigo}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  db.$client.close();
}
