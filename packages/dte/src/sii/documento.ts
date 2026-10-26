import { ErrorDominio, parsearRut, type Unidad } from '@almacen/core';
import { tipoDteSegunTotales, validarVentaParaDte } from '../reglas.js';
import type { LineaParaDte, TipoDte, VentaParaDte } from '../tipos.js';
import { elem, escaparAtributo, escaparTexto } from './xml.js';
import { fechaDte, fechaHoraDte } from './fechas.js';
import { construirTed } from './ted.js';
import { firmarDocumento } from './firma.js';
import { validarFolio } from './folios.js';
import type { Caf, CertificadoFirma, DocumentoGenerado, EmisorDte, ReceptorDte } from './tipos.js';

const RECEPTOR_CONSUMIDOR: ReceptorDte = { rut: '66666666-6', razonSocial: 'CLIENTE FINAL' };

export interface DatosGenerarDte {
  venta: VentaParaDte;
  emisor: EmisorDte;
  receptor?: ReceptorDte;
  caf: Caf;
  folio: number;
  certificado: CertificadoFirma;
  /** Identificador único del `<Documento>` (xs:ID, ej. "T39F1"). */
  idDocumento: string;
  /** Momento del timbrado (TSTED/TmstFirma). Por defecto, ahora. */
  ahora?: Date;
}

/**
 * Genera y firma el DTE de una boleta (39 afecta / 41 exenta): encabezado, detalle,
 * timbre electrónico (TED) y firma XMLDSig. Devuelve el elemento `<DTE>` aislado, listo
 * para incrustar en un `EnvioBOLETA` (Etapa 2). Ver ADR-008.
 */
export function generarDte(datos: DatosGenerarDte): DocumentoGenerado {
  const { venta, emisor, caf, folio, certificado, idDocumento } = datos;

  validarVentaParaDte(venta);
  const tipoDte = tipoDteSegunTotales(venta.totales);
  if (caf.tipoDte !== tipoDte) {
    throw new ErrorDominio('CAF_TIPO_DISTINTO', `El CAF es para DTE ${caf.tipoDte}, no ${tipoDte}`);
  }
  validarFolio(caf, folio);

  const rutEmisor = normalizarRutDte(emisor.rut);
  const receptor = datos.receptor ?? RECEPTOR_CONSUMIDOR;
  const rutReceptor = normalizarRutDte(receptor.rut);
  const ahora = datos.ahora ?? new Date();
  const fechaEmision = fechaDte(venta.fecha);
  const fechaHora = fechaHoraDte(ahora);

  const encabezado =
    `<Encabezado>` +
    idDoc(tipoDte, folio, fechaEmision) +
    emisorXml(emisor, rutEmisor) +
    receptorXml(rutReceptor, receptor.razonSocial) +
    totalesXml(tipoDte, venta) +
    `</Encabezado>`;

  const detalle = venta.lineas.map((l, i) => lineaXml(i + 1, l)).join('');

  const { ted } = construirTed(
    {
      rutEmisor,
      tipoDte,
      folio,
      fechaEmision,
      rutReceptor,
      razonSocialReceptor: receptor.razonSocial,
      montoTotal: venta.totales.totalClp,
      primerItem: venta.lineas[0]?.nombre ?? '',
      fechaHora,
    },
    caf,
  );

  const documentoXml =
    `<Documento ID="${escaparAtributo(idDocumento)}">` +
    encabezado +
    detalle +
    ted +
    elem('TmstFirma', fechaHora) +
    `</Documento>`;

  const firma = firmarDocumento(idDocumento, documentoXml, certificado);
  const xml = `<DTE version="1.0">${documentoXml}${firma}</DTE>`;

  return { tipoDte, folio, xml, ted };
}

function normalizarRutDte(rut: string): string {
  const p = parsearRut(rut);
  if (!p) throw new ErrorDominio('RUT_INVALIDO', `RUT inválido: ${rut}`);
  return `${p.cuerpo}-${p.dv}`;
}

function idDoc(tipoDte: TipoDte, folio: number, fecha: string): string {
  return (
    `<IdDoc>` +
    elem('TipoDTE', String(tipoDte)) +
    elem('Folio', String(folio)) +
    elem('FchEmis', fecha) +
    elem('FmaPago', '1') +
    `</IdDoc>`
  );
}

function emisorXml(e: EmisorDte, rut: string): string {
  return (
    `<Emisor>` +
    elem('RUTEmisor', rut) +
    elem('RznSoc', escaparTexto(e.razonSocial)) +
    elem('GiroEmis', escaparTexto(e.giro)) +
    elem('Acteco', escaparTexto(e.acteco)) +
    elem('DirOrigen', escaparTexto(e.direccion)) +
    elem('CmnaOrigen', escaparTexto(e.comuna)) +
    `</Emisor>`
  );
}

function receptorXml(rutReceptor: string, razonSocial: string): string {
  return (
    `<Receptor>` +
    elem('RUTRecep', rutReceptor) +
    elem('RznSocRecep', escaparTexto(razonSocial)) +
    `</Receptor>`
  );
}

function totalesXml(tipoDte: TipoDte, venta: VentaParaDte): string {
  const t = venta.totales;
  let s = '';
  if (tipoDte === 39) {
    s += elem('MntNeto', String(t.netoClp));
    if (t.exentoClp > 0) s += elem('MntExe', String(t.exentoClp));
    s += elem('TasaIVA', String(t.tasaIva)) + elem('IVA', String(t.ivaClp));
  } else {
    s += elem('MntExe', String(t.exentoClp));
  }
  s += elem('MntTotal', String(t.totalClp));
  return `<Totales>${s}</Totales>`;
}

function lineaXml(n: number, l: LineaParaDte): string {
  let s = elem('NroLinDet', String(n));
  if (l.tipoImpuesto === 'EXENTO') s += elem('IndExe', '1');
  s += elem('NmbItem', escaparTexto(l.nombre));
  s += elem('QtyItem', cantidadDte(l.cantidadMilli, l.unidad));
  // TODO(SII): confirmar el código oficial de unidad de medida ("KGS" vs "KG").
  s += elem('UnmdItem', l.unidad === 'KG' ? 'KGS' : 'UN');
  s += elem('PrcItem', String(l.precioUnitarioClp));
  // MontoItem es el total de la línea ya con descuentos. TODO(SII): confirmar si PrcItem
  // debe ser el precio neto para que QtyItem × PrcItem == MontoItem, y el desfase de $1 en
  // ventas "por monto" (ADR-006).
  s += elem('MontoItem', String(l.montoClp));
  return `<Detalle>${s}</Detalle>`;
}

function cantidadDte(cantidadMilli: number, unidad: Unidad): string {
  if (unidad === 'UN') return String(Math.round(cantidadMilli / 1000));
  // KG: hasta 3 decimales, sin ceros a la derecha.
  return (cantidadMilli / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
