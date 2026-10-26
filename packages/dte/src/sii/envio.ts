import { Buffer } from 'node:buffer';
import { ErrorDominio } from '@almacen/core';
import { elem } from './xml.js';
import { fechaDte, fechaHoraDte } from './fechas.js';
import { normalizarRutDte } from './rut.js';
import { firmarXml } from './firma.js';
import { NS_SII } from './documento.js';
import type { CertificadoFirma, DocumentoGenerado } from './tipos.js';

/** RUT del SII, receptor de todos los envíos de boletas. */
export const RUT_RECEPTOR_SII = '60803000-K';

/**
 * Lote recomendado por el SII para no saturar la API. El schema admite hasta 500, pero
 * el propio manual sugiere enviar de a 50. Ver ADR-009.
 */
export const MAX_BOLETAS_POR_ENVIO = 50;

const PREFIJO_DTE = `<DTE version="1.0" xmlns="${NS_SII}">`;
const ID_SET_DTE_POR_DEFECTO = 'SetDoc';
const ID_XS_ID = /^[A-Za-z_][A-Za-z0-9._-]*$/;

export interface DatosEnvioBoleta {
  /** RUT del emisor de las boletas (con guion y DV). */
  rutEmisor: string;
  /** RUT de la persona que hace el envío (con guion y DV). */
  rutEnvia: string;
  /** Boletas firmadas (39/41), en el orden en que se enviarán. */
  documentos: readonly DocumentoGenerado[];
  /** Fecha de la resolución que autoriza la emisión (AAAA-MM-DD). */
  fchResol: string;
  /** Número de la resolución (hasta 6 dígitos). */
  nroResol: number;
  certificado: CertificadoFirma;
  /** Momento de la firma del envío. Por defecto, ahora. */
  ahora?: Date;
  /** `xs:ID` del `<SetDTE>`. Por defecto `SetDoc`. */
  idSetDte?: string;
  /** Nombre del archivo que se enviará al SII. */
  nombreArchivo?: string;
}

export interface EnvioBoletaGenerado {
  /** XML completo del `EnvioBOLETA` (ISO-8859-1), listo para enviar. */
  xml: string;
  cantidad: number;
  nombreArchivo: string;
}

/**
 * Genera y firma el `EnvioBOLETA` que agrupa las boletas de un lote (máximo 50).
 *
 * El `<SetDTE>` se firma por su `ID`; el digest se calcula sobre su forma canónica, que
 * declara el namespace `SiiDte` en el nodo raíz de la referencia. Por eso los `<DTE>`
 * incrustados **no** repiten el `xmlns` (lo heredan del `EnvioBOLETA`): si lo repitieran,
 * C14N lo omitiría igual, pero la forma literal y la canónica dejarían de coincidir.
 *
 * El archivo se declara ISO-8859-1 (codificación que exige el SII). El cliente lo
 * convierte a bytes Latin-1 antes de enviarlo. Ver ADR-009.
 */
export function generarEnvioBoleta(datos: DatosEnvioBoleta): EnvioBoletaGenerado {
  const { documentos, certificado } = datos;
  const primero = documentos[0];
  if (!primero) {
    throw new ErrorDominio('ENVIO_SIN_DOCUMENTOS', 'El envío debe incluir al menos una boleta');
  }
  if (documentos.length > MAX_BOLETAS_POR_ENVIO) {
    throw new ErrorDominio(
      'ENVIO_MUY_GRANDE',
      `El envío tiene ${documentos.length} boletas; el máximo recomendado es ${MAX_BOLETAS_POR_ENVIO}`,
    );
  }

  const rutEmisor = normalizarRutDte(datos.rutEmisor);
  const rutEnvia = normalizarRutDte(datos.rutEnvia);
  const fchResol = validarFechaResolucion(datos.fchResol);
  const nroResol = validarNroResol(datos.nroResol);
  const idSetDte = datos.idSetDte ?? ID_SET_DTE_POR_DEFECTO;
  if (!ID_XS_ID.test(idSetDte)) {
    throw new ErrorDominio(
      'ID_SET_DTE_INVALIDO',
      `El ID del SetDTE no es un xs:ID válido: "${idSetDte}"`,
    );
  }
  validarDocumentos(documentos);

  const ahora = datos.ahora ?? new Date();
  const caratula =
    `<Caratula version="1.0">` +
    elem('RutEmisor', rutEmisor) +
    elem('RutEnvia', rutEnvia) +
    elem('RutReceptor', RUT_RECEPTOR_SII) +
    elem('FchResol', fchResol) +
    elem('NroResol', String(nroResol)) +
    elem('TmstFirmaEnv', fechaHoraDte(ahora)) +
    subtotales(documentos) +
    `</Caratula>`;

  const dtes = documentos.map((d) => dteSinNamespace(d.xml)).join('');
  const setDteCanonico = `<SetDTE xmlns="${NS_SII}" ID="${idSetDte}">${caratula}${dtes}</SetDTE>`;
  const firma = firmarXml({
    referencia: `#${idSetDte}`,
    canonico: setDteCanonico,
    certificado,
  });

  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>` +
    `<EnvioBOLETA version="1.0" xmlns="${NS_SII}">` +
    `<SetDTE ID="${idSetDte}">${caratula}${dtes}</SetDTE>` +
    firma +
    `</EnvioBOLETA>`;

  validarLatin1(xml);

  return {
    xml,
    cantidad: documentos.length,
    nombreArchivo: datos.nombreArchivo ?? `boleta-${fechaDte(ahora)}-${primero.folio}.xml`,
  };
}

function subtotales(documentos: readonly DocumentoGenerado[]): string {
  const n39 = documentos.filter((d) => d.tipoDte === 39).length;
  const n41 = documentos.filter((d) => d.tipoDte === 41).length;
  let s = '';
  if (n39 > 0) s += `<SubTotDTE><TpoDTE>39</TpoDTE><NroDTE>${n39}</NroDTE></SubTotDTE>`;
  if (n41 > 0) s += `<SubTotDTE><TpoDTE>41</TpoDTE><NroDTE>${n41}</NroDTE></SubTotDTE>`;
  return s;
}

function validarDocumentos(documentos: readonly DocumentoGenerado[]): void {
  const vistos = new Set<string>();
  for (const d of documentos) {
    if (!Number.isInteger(d.folio) || d.folio <= 0) {
      throw new ErrorDominio('FOLIO_INVALIDO', `Folio inválido en el envío: ${d.folio}`);
    }
    const clave = `${d.tipoDte}-${d.folio}`;
    if (vistos.has(clave)) {
      throw new ErrorDominio(
        'ENVIO_FOLIO_DUPLICADO',
        `La boleta ${d.tipoDte}-${d.folio} está repetida en el envío`,
      );
    }
    vistos.add(clave);
  }
}

export function validarFechaResolucion(valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const anio = m?.[1];
  const mes = m?.[2];
  const dia = m?.[3];
  if (!anio || !mes || !dia) {
    throw new ErrorDominio(
      'FCH_RESOL_INVALIDA',
      `La fecha de resolución debe ser AAAA-MM-DD: "${valor}"`,
    );
  }
  const f = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  if (
    f.getUTCFullYear() !== Number(anio) ||
    f.getUTCMonth() !== Number(mes) - 1 ||
    f.getUTCDate() !== Number(dia)
  ) {
    throw new ErrorDominio('FCH_RESOL_INVALIDA', `La fecha de resolución no existe: "${valor}"`);
  }
  return valor;
}

export function validarNroResol(valor: number): number {
  if (!Number.isInteger(valor) || valor < 0 || valor > 999_999) {
    throw new ErrorDominio(
      'NRO_RESOL_INVALIDO',
      `El número de resolución debe ser un entero entre 0 y 999999: ${valor}`,
    );
  }
  return valor;
}

/**
 * El `<DTE>` se generó con su propio `xmlns` para poder validarse aislado. Dentro del
 * `EnvioBOLETA` el namespace ya está declarado en la raíz, así que se quita para que la
 * forma literal coincida con la canónica del `<SetDTE>`.
 */
function dteSinNamespace(xml: string): string {
  if (!xml.startsWith(PREFIJO_DTE)) {
    throw new ErrorDominio(
      'DTE_INVALIDO',
      'El DTE no tiene la forma esperada (<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">)',
    );
  }
  return `<DTE version="1.0">${xml.slice(PREFIJO_DTE.length)}`;
}

/**
 * El SII exige ISO-8859-1. Se falla antes de enviar si un carácter (por ejemplo un emoji
 * en el nombre de un producto) no se puede representar, para no firmar un archivo que el
 * SII leería distinto.
 */
function validarLatin1(xml: string): void {
  for (const caracter of xml) {
    const cp = caracter.codePointAt(0);
    if (cp !== undefined && cp > 0xff) {
      throw new ErrorDominio(
        'CARACTER_NO_LATIN1',
        `El XML contiene "${caracter}", que no se puede representar en ISO-8859-1`,
      );
    }
  }
}

/** Codifica el XML del envío en ISO-8859-1, que es lo que viaja al SII. */
export function codificarEnvioLatin1(xml: string): Buffer {
  validarLatin1(xml);
  return Buffer.from(xml, 'latin1');
}
