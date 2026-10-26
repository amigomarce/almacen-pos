import type { TipoDte } from '../tipos.js';

/**
 * Datos del emisor que van al encabezado de la boleta (39/41). El schema de boleta no
 * incluye `Acteco` (eso es de factura); el SII identifica al emisor por su RUT.
 */
export interface EmisorDte {
  /** RUT con guion y dígito verificador: "76.086.428-5". */
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
}

/** Receptor de la boleta. Por defecto, consumidor final (66666666-6). */
export interface ReceptorDte {
  rut: string;
  razonSocial: string;
}

/** Certificado digital del emisor, para la firma XMLDSig del DTE. */
export interface CertificadoFirma {
  /** PEM del certificado X.509. */
  certificadoPem: string;
  /** PEM de la clave privada RSA. */
  clavePrivadaPem: string;
}

/**
 * CAF (Código de Autorización de Folios) parseado. El `xmlCaf` conserva el elemento
 * `<CAF>` completo y compacto para incrustarlo verbatim en el timbre (TED).
 */
export interface Caf {
  rut: string;
  razonSocial: string;
  tipoDte: TipoDte;
  folioDesde: number;
  folioHasta: number;
  /** YYYY-MM-DD */
  fechaAutorizacion: string;
  idk: number;
  /** Módulo de la llave del CAF (base64 DER). */
  modulo: string;
  /** Exponente de la llave del CAF (base64 DER). */
  exponente: string;
  /** Clave privada RSA del CAF (PEM PKCS#1). */
  clavePrivadaPem: string;
  /** Elemento `<CAF version="1.0">…</CAF>` compacto, para el TED. */
  xmlCaf: string;
}

/** DTE generado (firmado), listo para incrustar en un EnvioBOLETA. */
export interface DocumentoGenerado {
  tipoDte: TipoDte;
  folio: number;
  /** XML del elemento `<DTE>` firmado. */
  xml: string;
  /** El `<TED>` firmado (para el código PDF417 y respaldo). */
  ted: string;
}
