import { ErrorDominio, type Unidad } from '@almacen/core';
import { tipoDteSegunTotales, validarVentaParaDte } from '../reglas.js';
import type { LineaParaDte, TipoDte, VentaParaDte } from '../tipos.js';
import { elem, escaparAtributo, escaparTexto } from './xml.js';
import { fechaDte, fechaHoraDte } from './fechas.js';
import { normalizarRutDte } from './rut.js';
import { construirTed } from './ted.js';
import { firmarDocumento } from './firma.js';
import { validarFolio } from './folios.js';
import type { Caf, CertificadoFirma, DocumentoGenerado, EmisorDte, ReceptorDte } from './tipos.js';

/** Namespace del DTE del SII (EnvioBOLETA_v11.xsd). */
export const NS_SII = 'http://www.sii.cl/SiiDte';

/** `IndServicio` 3 = Boleta de Ventas y Servicio (schema de boleta). */
const IND_SERVICIO = '3';

const RECEPTOR_CONSUMIDOR: ReceptorDte = { rut: '66666666-6', razonSocial: 'CLIENTE FINAL' };

/**
 * Largos máximos del schema de boleta. Los datos legales se validan (no se recortan: son
 * la identidad del emisor); el nombre del ítem se recorta para no bloquear una venta.
 */
const MAX = {
  razonSocial: 100,
  giro: 80,
  direccion: 70,
  comuna: 20,
  item: 80,
} as const;

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
 *
 * Los montos del detalle (`PrcItem`, `MontoItem`) son **brutos** (con IVA), como define
 * el schema de boleta cuando no se declara `IndMntNeto`. `MntNeto` e `IVA` de `Totales`
 * se calculan una sola vez sobre el total afecto (ADR-003).
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

  const contenido = encabezado + detalle + ted + elem('TmstFirma', fechaHora);

  const documentoXml = `<Documento ID="${escaparAtributo(idDocumento)}">${contenido}</Documento>`;
  // Forma canónica (C14N) del <Documento> dentro del <DTE>: el namespace por defecto está
  // en el alcance del elemento, así que C14N lo declara en el nodo raíz de la referencia.
  // Se firma esta forma, no la literal (que hereda el namespace del <DTE>).
  const documentoCanonico = `<Documento xmlns="${NS_SII}" ID="${escaparAtributo(idDocumento)}">${contenido}</Documento>`;

  const firma = firmarDocumento(idDocumento, documentoCanonico, certificado);
  const xml = `<DTE version="1.0" xmlns="${NS_SII}">${documentoXml}${firma}</DTE>`;

  return { tipoDte, folio, xml, ted };
}

function idDoc(tipoDte: TipoDte, folio: number, fecha: string): string {
  return (
    `<IdDoc>` +
    elem('TipoDTE', String(tipoDte)) +
    elem('Folio', String(folio)) +
    elem('FchEmis', fecha) +
    elem('IndServicio', IND_SERVICIO) +
    `</IdDoc>`
  );
}

function emisorXml(e: EmisorDte, rut: string): string {
  return (
    `<Emisor>` +
    elem('RUTEmisor', rut) +
    elem(
      'RznSocEmisor',
      escaparTexto(exigirLargo(e.razonSocial, MAX.razonSocial, 'la razón social')),
    ) +
    elem('GiroEmisor', escaparTexto(exigirLargo(e.giro, MAX.giro, 'el giro'))) +
    elem('DirOrigen', escaparTexto(exigirLargo(e.direccion, MAX.direccion, 'la dirección'))) +
    elem('CmnaOrigen', escaparTexto(exigirLargo(e.comuna, MAX.comuna, 'la comuna'))) +
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
    s += elem('IVA', String(t.ivaClp));
  } else {
    s += elem('MntExe', String(t.exentoClp));
  }
  s += elem('MntTotal', String(t.totalClp));
  return `<Totales>${s}</Totales>`;
}

function lineaXml(n: number, l: LineaParaDte): string {
  if (!Number.isInteger(l.cantidadMilli) || l.cantidadMilli <= 0) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', `Línea ${n}: la cantidad debe ser mayor a 0`);
  }
  if (l.unidad === 'UN' && l.cantidadMilli % 1000 !== 0) {
    throw new ErrorDominio(
      'CANTIDAD_FRACCIONARIA',
      `Línea ${n}: un producto por unidad no admite fracciones`,
    );
  }

  let s = elem('NroLinDet', String(n));
  if (l.tipoImpuesto === 'EXENTO') s += elem('IndExe', '1');
  s += elem('NmbItem', escaparTexto(recortar(l.nombre, MAX.item)));
  s += elem('QtyItem', cantidadDte(l.cantidadMilli, l.unidad));
  s += elem('UnmdItem', l.unidad === 'KG' ? 'KG' : 'UN');
  const prc = precioUnitarioDte(l.montoClp, l.cantidadMilli);
  if (prc !== null) s += elem('PrcItem', prc);
  // MontoItem es el total bruto de la línea (con descuentos aplicados).
  s += elem('MontoItem', String(l.montoClp));
  return `<Detalle>${s}</Detalle>`;
}

/**
 * Precio unitario bruto que cuadra con el monto de la línea. Se deriva del monto (y no del
 * precio de lista) para que `QtyItem × PrcItem ≈ MontoItem` también en ventas con descuento
 * o "por monto" (ADR-006). `PrcItem` no admite 0, así que se omite en líneas gratis.
 */
function precioUnitarioDte(montoClp: number, cantidadMilli: number): string | null {
  if (montoClp === 0) return null;
  const precio = (montoClp * 1000) / cantidadMilli;
  const texto = precio.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return texto === '0' ? null : texto;
}

function cantidadDte(cantidadMilli: number, unidad: Unidad): string {
  if (unidad === 'UN') return String(cantidadMilli / 1000);
  // KG: hasta 3 decimales (gramos), sin ceros a la derecha.
  return (cantidadMilli / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function exigirLargo(valor: string, max: number, campo: string): string {
  const limpio = valor.trim();
  if (limpio === '') throw new ErrorDominio('DATO_OBLIGATORIO', `Falta ${campo} del emisor`);
  if (limpio.length > max) {
    throw new ErrorDominio(
      'DATO_MUY_LARGO',
      `${campo} supera los ${max} caracteres que acepta el SII: "${limpio}"`,
    );
  }
  return limpio;
}

function recortar(valor: string, max: number): string {
  return valor.length > max ? valor.slice(0, max) : valor;
}
