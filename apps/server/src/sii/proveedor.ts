import { ErrorDominio } from '@almacen/core';
import {
  ClienteSii,
  SiiDirectoProvider,
  crearProvider,
  type DocumentoTributarioProvider,
} from '@almacen/dte';
import type { Configuracion } from '../configuracion/servicio.js';
import type { Db } from '../db/client.js';
import { leerCredencialesSii, siiListo } from './config.js';
import { crearRepositorioSii } from './repositorio.js';

type Fetch = typeof fetch;

/** Dependencias locales de la emisión directa: clave de cifrado y, en tests, red y reloj. */
export interface DependenciasSii {
  /** Se resuelve solo cuando el local usa `SII_DIRECTO` (no crea la clave al instalar). */
  clave: () => Buffer;
  fetchFn?: Fetch;
  ahora?: () => Date;
  userAgent?: string;
  maxIntentos?: number;
}

/**
 * Provider tributario según la modalidad del local.
 *
 * `MOCK` y `PUENTE_MANUAL` no necesitan nada más. `SII_DIRECTO` exige certificado y CAF
 * cargados; si falta algo, falla con un código claro en vez de emitir un documento inválido.
 */
export function crearProviderDeVenta(
  db: Db,
  config: Configuracion,
  dependencias?: DependenciasSii,
): DocumentoTributarioProvider {
  if (config.dteProvider !== 'SII_DIRECTO') {
    return crearProvider(config.dteProvider, config.modeloEmision);
  }
  if (!dependencias) {
    throw new ErrorDominio(
      'SII_NO_CONFIGURADO',
      'La emisión directa al SII no está configurada en esta caja',
    );
  }

  const ahora = dependencias.ahora ?? (() => new Date());
  if (!siiListo(db, ahora())) {
    throw new ErrorDominio(
      'SII_NO_CONFIGURADO',
      'Falta el certificado o un CAF vigente para emitir boletas al SII',
    );
  }
  const clave = dependencias.clave();
  const credenciales = leerCredencialesSii(db, clave);
  if (!credenciales) {
    throw new ErrorDominio(
      'SII_NO_CONFIGURADO',
      'Falta el certificado o un CAF vigente para emitir boletas al SII',
    );
  }

  const { rut, razonSocial, giro, direccion, comuna } = config;
  if (!rut || !razonSocial || !giro || !direccion || !comuna) {
    throw new ErrorDominio(
      'DATOS_LOCAL_INCOMPLETOS',
      'Completa el RUT, la razón social, el giro, la dirección y la comuna del local',
    );
  }

  const cliente = new ClienteSii({
    ambiente: credenciales.ambiente,
    rutEmisor: rut,
    rutEnvia: credenciales.rutEnvia,
    certificado: credenciales.certificado,
    fetchFn: dependencias.fetchFn ?? ((...args) => fetch(...args)),
    ahora: () => ahora().getTime(),
    ...(dependencias.userAgent ? { userAgent: dependencias.userAgent } : {}),
  });

  return new SiiDirectoProvider({
    modelo: config.modeloEmision,
    emisor: { rut, razonSocial, giro, direccion, comuna },
    rutEnvia: credenciales.rutEnvia,
    fchResol: credenciales.fchResol,
    nroResol: credenciales.nroResol,
    certificado: credenciales.certificado,
    repositorio: crearRepositorioSii(db, clave, { ahora }),
    cliente,
    ahora,
    ...(dependencias.maxIntentos === undefined ? {} : { maxIntentos: dependencias.maxIntentos }),
  });
}
