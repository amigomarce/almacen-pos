import { createPrivateKey, X509Certificate } from 'node:crypto';
import { ErrorDominio, parsearRut } from '@almacen/core';
import {
  parsearCaf,
  validarFechaResolucion,
  validarNroResol,
  type AmbienteSii,
  type Caf,
  type CertificadoFirma,
  type TipoDte,
} from '@almacen/dte';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cafRanges, storeSettings } from '../db/schema.js';
import { cifrar, descifrar } from './cifrado.js';

/**
 * Configuración local para emitir boletas directo al SII. El certificado y su clave se
 * guardan cifrados en `store_settings`; los CAF, cifrados en `caf_ranges`. Nada de esto
 * sale por la API ni se escribe en logs (CLAUDE.md §3).
 */
export interface CredencialesSii {
  ambiente: AmbienteSii;
  rutEnvia: string;
  fchResol: string;
  nroResol: number;
  certificado: CertificadoFirma;
  certificadoHasta: Date;
}

export interface DatosCredencialesSii {
  certificadoPem: string;
  clavePrivadaPem: string;
  rutEnvia: string;
  fchResol: string;
  nroResol: number;
  ambiente?: AmbienteSii;
}

const AMBIENTES: readonly AmbienteSii[] = ['certificacion', 'produccion'];

/** Normaliza un RUT al formato del DTE: sin puntos, con guion ("76086428-5"). */
export function rutCanonico(rut: string): string {
  const p = parsearRut(rut);
  if (!p) throw new ErrorDominio('RUT_INVALIDO', `RUT inválido: ${rut}`);
  return `${p.cuerpo}-${p.dv}`;
}

/**
 * Valida y guarda el certificado digital y los datos de envío. Falla si el certificado
 * está vencido o si la clave privada no corresponde: es mejor detectarlo al configurar
 * que al emitir la primera boleta.
 */
export function guardarCredencialesSii(
  db: Db,
  datos: DatosCredencialesSii,
  clave: Buffer,
  ahora = new Date(),
): CredencialesSii {
  const certificadoPem = datos.certificadoPem.trim();
  const clavePrivadaPem = datos.clavePrivadaPem.trim();

  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(certificadoPem);
  } catch {
    throw new ErrorDominio('CERTIFICADO_INVALIDO', 'El certificado no es un X.509 PEM válido');
  }
  let privada: ReturnType<typeof createPrivateKey>;
  try {
    privada = createPrivateKey(clavePrivadaPem);
  } catch {
    throw new ErrorDominio('CLAVE_PRIVADA_INVALIDA', 'La clave privada no es un PEM válido');
  }
  let coincide: boolean;
  try {
    coincide = x509.checkPrivateKey(privada);
  } catch {
    coincide = false;
  }
  if (!coincide) {
    throw new ErrorDominio(
      'CERTIFICADO_CLAVE_NO_COINCIDE',
      'La clave privada no corresponde al certificado',
    );
  }
  const hasta = new Date(x509.validTo);
  if (Number.isNaN(hasta.getTime()) || hasta <= ahora) {
    throw new ErrorDominio('CERTIFICADO_VENCIDO', 'El certificado digital está vencido');
  }

  const rutEnvia = rutCanonico(datos.rutEnvia);
  const fchResol = validarFechaResolucion(datos.fchResol);
  const nroResol = validarNroResol(datos.nroResol);
  const ambiente = datos.ambiente ?? 'certificacion';
  if (!AMBIENTES.includes(ambiente)) {
    throw new ErrorDominio('AMBIENTE_SII_INVALIDO', `Ambiente del SII desconocido: ${ambiente}`);
  }

  const valores = {
    siiAmbiente: ambiente,
    siiRutEnvia: rutEnvia,
    siiFchResol: fchResol,
    siiNroResol: nroResol,
    siiCredenciales: cifrar(JSON.stringify({ certificadoPem, clavePrivadaPem }), clave),
    siiCertificadoHasta: hasta,
    updatedAt: new Date(),
  };
  const existe = db.select({ id: storeSettings.id }).from(storeSettings).get();
  if (existe) {
    db.update(storeSettings).set(valores).where(eq(storeSettings.id, 1)).run();
  } else {
    db.insert(storeSettings).values(valores).run();
  }

  return {
    ambiente,
    rutEnvia,
    fchResol,
    nroResol,
    certificado: { certificadoPem, clavePrivadaPem },
    certificadoHasta: hasta,
  };
}

/**
 * Lee y descifra las credenciales. Devuelve `null` si todavía no se configuraron; falla si
 * el certificado venció o si la clave local ya no descifra los datos.
 */
export function leerCredencialesSii(db: Db, clave: Buffer): CredencialesSii | null {
  const fila = db
    .select({
      ambiente: storeSettings.siiAmbiente,
      rutEnvia: storeSettings.siiRutEnvia,
      fchResol: storeSettings.siiFchResol,
      nroResol: storeSettings.siiNroResol,
      credenciales: storeSettings.siiCredenciales,
      hasta: storeSettings.siiCertificadoHasta,
    })
    .from(storeSettings)
    .get();
  if (
    !fila?.ambiente ||
    !fila.rutEnvia ||
    !fila.fchResol ||
    fila.nroResol === null ||
    !fila.credenciales ||
    !fila.hasta
  ) {
    return null;
  }
  if (fila.hasta <= new Date()) {
    throw new ErrorDominio('CERTIFICADO_VENCIDO', 'El certificado digital está vencido');
  }

  let datos: { certificadoPem?: unknown; clavePrivadaPem?: unknown };
  try {
    datos = JSON.parse(descifrar(fila.credenciales, clave)) as typeof datos;
  } catch (error) {
    if (error instanceof ErrorDominio) throw error;
    throw new ErrorDominio('SECRETO_SII_INVALIDO', 'Las credenciales del SII están corruptas');
  }
  if (typeof datos.certificadoPem !== 'string' || typeof datos.clavePrivadaPem !== 'string') {
    throw new ErrorDominio('SECRETO_SII_INVALIDO', 'Las credenciales del SII están incompletas');
  }

  return {
    ambiente: fila.ambiente,
    rutEnvia: fila.rutEnvia,
    fchResol: fila.fchResol,
    nroResol: fila.nroResol,
    certificado: {
      certificadoPem: datos.certificadoPem,
      clavePrivadaPem: datos.clavePrivadaPem,
    },
    certificadoHasta: fila.hasta,
  };
}

/**
 * Guarda un CAF cifrado. Rechaza CAF de otro emisor y rangos superpuestos: dos CAF con
 * folios en común harían que el SII rechace el envío por folio repetido.
 */
export function guardarCafSii(db: Db, xml: string, clave: Buffer): Caf {
  const caf = parsearCaf(xml);
  const rutLocal = db.select({ rut: storeSettings.rut }).from(storeSettings).get()?.rut;
  if (rutLocal && rutCanonico(rutLocal) !== rutCanonico(caf.rut)) {
    throw new ErrorDominio(
      'CAF_OTRO_EMISOR',
      `El CAF es de ${caf.rut}, pero el local está configurado con ${rutLocal}`,
    );
  }

  const superpuesto = db
    .select({ id: cafRanges.id })
    .from(cafRanges)
    .where(
      and(
        eq(cafRanges.dteType, caf.tipoDte),
        lte(cafRanges.folioFrom, caf.folioHasta),
        gte(cafRanges.folioTo, caf.folioDesde),
      ),
    )
    .get();
  if (superpuesto) {
    throw new ErrorDominio(
      'CAF_SUPERPUESTO',
      `Ya hay un CAF de tipo ${caf.tipoDte} que se cruza con el rango ${caf.folioDesde}–${caf.folioHasta}`,
    );
  }

  db.insert(cafRanges)
    .values({
      dteType: caf.tipoDte,
      folioFrom: caf.folioDesde,
      folioTo: caf.folioHasta,
      nextFolio: caf.folioDesde,
      xmlEncrypted: cifrar(xml, clave),
    })
    .run();
  return caf;
}

/** ¿Está todo listo para emitir directo al SII? Certificado vigente y al menos un CAF con folios. */
export function siiListo(db: Db, ahora = new Date()): boolean {
  const fila = db
    .select({
      rut: storeSettings.rut,
      razonSocial: storeSettings.razonSocial,
      giro: storeSettings.giro,
      direccion: storeSettings.direccion,
      comuna: storeSettings.comuna,
      ambiente: storeSettings.siiAmbiente,
      rutEnvia: storeSettings.siiRutEnvia,
      fchResol: storeSettings.siiFchResol,
      nroResol: storeSettings.siiNroResol,
      credenciales: storeSettings.siiCredenciales,
      hasta: storeSettings.siiCertificadoHasta,
    })
    .from(storeSettings)
    .get();
  if (
    !fila?.rut ||
    !fila.razonSocial ||
    !fila.giro ||
    !fila.direccion ||
    !fila.comuna ||
    !fila.ambiente ||
    !fila.rutEnvia ||
    !fila.fchResol ||
    fila.nroResol === null ||
    !fila.credenciales ||
    !fila.hasta ||
    fila.hasta <= ahora
  ) {
    return false;
  }
  return hayFolios(db, ahora);
}

/** Ambiente del SII cargado con `sii:cargar`; `null` si todavía no hay credenciales. */
export function ambienteSii(db: Db): AmbienteSii | null {
  return db.select({ a: storeSettings.siiAmbiente }).from(storeSettings).get()?.a ?? null;
}

/** CAF vigente con folios disponibles para el tipo de documento. */
export function hayFolios(db: Db, ahora = new Date()): boolean {
  const fila = db
    .select({ id: cafRanges.id })
    .from(cafRanges)
    .where(
      and(
        lte(cafRanges.nextFolio, cafRanges.folioTo),
        or(isNull(cafRanges.expiresAt), gte(cafRanges.expiresAt, ahora)),
      ),
    )
    .get();
  return fila !== undefined;
}

export interface ResumenCafSii {
  tipoDte: TipoDte;
  desde: number;
  hasta: number;
  siguiente: number;
  disponibles: number;
}

/** Estado no sensible para diagnóstico (sin certificado, claves ni XML). */
export function resumenSii(db: Db): {
  listo: boolean;
  ambiente: AmbienteSii | null;
  certificadoHasta: string | null;
  cafs: ResumenCafSii[];
} {
  const fila = db
    .select({
      ambiente: storeSettings.siiAmbiente,
      hasta: storeSettings.siiCertificadoHasta,
    })
    .from(storeSettings)
    .get();
  const cafs = db
    .select({
      tipoDte: cafRanges.dteType,
      desde: cafRanges.folioFrom,
      hasta: cafRanges.folioTo,
      siguiente: cafRanges.nextFolio,
    })
    .from(cafRanges)
    .orderBy(cafRanges.dteType, cafRanges.folioFrom)
    .all()
    .map((c) => ({
      tipoDte: c.tipoDte as TipoDte,
      desde: c.desde,
      hasta: c.hasta,
      siguiente: c.siguiente,
      disponibles: Math.max(0, c.hasta - c.siguiente + 1),
    }));
  return {
    listo: siiListo(db),
    ambiente: fila?.ambiente ?? null,
    certificadoHasta: fila?.hasta?.toISOString() ?? null,
    cafs,
  };
}
