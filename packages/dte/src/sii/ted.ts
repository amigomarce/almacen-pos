import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { ErrorDominio } from '@almacen/core';
import type { TipoDte } from '../tipos.js';
import { normalizarRutDte } from './rut.js';
import { elem, escaparTexto } from './xml.js';
import type { Caf } from './tipos.js';

/** Datos representativos del documento que entran al timbre (TED). */
export interface DatosTed {
  rutEmisor: string;
  tipoDte: TipoDte;
  folio: number;
  /** AAAA-MM-DD */
  fechaEmision: string;
  rutReceptor: string;
  razonSocialReceptor: string;
  montoTotal: number;
  /** Descripción del primer ítem del detalle. */
  primerItem: string;
  /** AAAA-MM-DDTHH:MM:SS */
  fechaHora: string;
}

/** RSR e IT1 están limitados a 40 caracteres en el schema. */
const LARGO_MAX = 40;

function recortar(s: string): string {
  return s.length > LARGO_MAX ? s.slice(0, LARGO_MAX) : s;
}

/**
 * Arma el `<TED version="1.0">` firmado. La firma del timbre (`<FRMT>`) se calcula con
 * SHA1withRSA sobre el elemento `<DD>` "aplanado" (sin espacios entre etiquetas),
 * codificado en ISO-8859-1, usando la clave privada del CAF. Ver ADR-008.
 */
export function construirTed(datos: DatosTed, caf: Caf): { ted: string; dd: string } {
  if (caf.tipoDte !== datos.tipoDte) {
    throw new ErrorDominio(
      'CAF_TIPO_DISTINTO',
      `El CAF es para DTE ${caf.tipoDte}, no ${datos.tipoDte}`,
    );
  }
  if (normalizarRutDte(caf.rut) !== normalizarRutDte(datos.rutEmisor)) {
    throw new ErrorDominio(
      'CAF_OTRO_EMISOR',
      `El CAF es del RUT ${caf.rut}, no del emisor ${datos.rutEmisor}`,
    );
  }

  const dd =
    elem('RE', escaparTexto(datos.rutEmisor)) +
    elem('TD', String(datos.tipoDte)) +
    elem('F', String(datos.folio)) +
    elem('FE', datos.fechaEmision) +
    elem('RR', escaparTexto(datos.rutReceptor)) +
    elem('RSR', escaparTexto(recortar(datos.razonSocialReceptor))) +
    elem('MNT', String(datos.montoTotal)) +
    elem('IT1', escaparTexto(recortar(datos.primerItem))) +
    caf.xmlCaf +
    elem('TSTED', datos.fechaHora);

  const ddXml = `<DD>${dd}</DD>`;
  const firma = firmarTed(ddXml, caf.clavePrivadaPem);
  const ted = `<TED version="1.0">${ddXml}<FRMT algoritmo="SHA1withRSA">${firma}</FRMT></TED>`;
  return { ted, dd: ddXml };
}

/** SHA1withRSA sobre el `<DD>` aplanado, codificado en ISO-8859-1. */
export function firmarTed(ddPlano: string, clavePrivadaPem: string): string {
  return createSign('RSA-SHA1')
    .update(Buffer.from(ddPlano, 'latin1'))
    .end()
    .sign(clavePrivadaPem, 'base64');
}
