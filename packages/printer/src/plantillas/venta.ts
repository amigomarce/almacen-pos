import {
  ErrorDominio,
  formatearCantidad,
  formatearClp,
  type MedioPago,
  type Unidad,
} from '@almacen/core';
import { LEYENDA_COMPROBANTE_INTERNO } from '@almacen/dte';
import { Documento } from '../documento.js';
import { fechaHora, NOMBRE_MEDIO, type DatosLocal } from '../formato.js';
import { encabezadoLocal } from './encabezado.js';

export interface LineaTicket {
  nombre: string;
  unidad: Unidad;
  cantidadMilli: number;
  precioUnitarioClp: number;
  descuentoClp: number;
  totalLineaClp: number;
}

export interface DatosTicketVenta {
  local: DatosLocal;
  numero: number;
  fecha: Date;
  cajero: string;
  lineas: readonly LineaTicket[];
  totalClp: number;
  redondeoClp: number;
  totalCobradoClp: number;
  medioPago: MedioPago;
  pagadoClp: number;
  vueltoClp: number;
  exentoClp: number;
  documento: {
    leyendas: readonly string[];
    folioExterno: string | null;
    validoComoBoleta: boolean;
  } | null;
  motivoSinDocumento: 'VOUCHER_ES_BOLETA' | 'TOTAL_CERO' | null;
  anulada: boolean;
  /** Copia impresa después (no en el momento de la venta). */
  reimpresion?: boolean;
  /** Abrir el cajón al imprimir (solo tiene sentido en efectivo). */
  abrirCajon?: boolean;
}

/**
 * Comprobante interno de la venta. Mientras no exista la boleta electrónica propia (Fase 5),
 * SIEMPRE dice "NO VÁLIDO COMO BOLETA" (CLAUDE.md §2).
 */
export function ticketVenta(datos: DatosTicketVenta, columnas: number): Documento {
  if (datos.documento?.validoComoBoleta) {
    throw new ErrorDominio(
      'BOLETA_NO_SOPORTADA',
      'La impresión de boletas electrónicas válidas llega en la Fase 5',
    );
  }
  const doc = new Documento(columnas);
  encabezadoLocal(doc, datos.local);
  doc.separador();

  if (datos.anulada)
    doc.texto('*** ANULADA ***', { alinear: 'CENTRO', negrita: true, grande: true });
  if (datos.reimpresion) doc.texto('REIMPRESIÓN', { alinear: 'CENTRO', negrita: true });
  const [primera, ...otras] = datos.documento?.leyendas ?? [LEYENDA_COMPROBANTE_INTERNO];
  doc.texto(primera ?? LEYENDA_COMPROBANTE_INTERNO, { alinear: 'CENTRO', negrita: true });
  doc.separador();

  doc.texto(`Venta N° ${datos.numero}`, { negrita: true });
  doc.columnas2(fechaHora(datos.fecha), `Cajero: ${datos.cajero}`);
  doc.separador();

  for (const l of datos.lineas) {
    doc.texto(l.nombre);
    const precio =
      l.unidad === 'KG'
        ? `${formatearClp(l.precioUnitarioClp)}/kg`
        : formatearClp(l.precioUnitarioClp);
    doc.columnas2(
      `  ${formatearCantidad(l.cantidadMilli, l.unidad)} x ${precio}`,
      formatearClp(l.totalLineaClp + l.descuentoClp),
    );
    if (l.descuentoClp > 0) doc.columnas2('  Descuento', formatearClp(-l.descuentoClp));
  }
  doc.separador();

  doc.columnas2('TOTAL', formatearClp(datos.totalClp), { negrita: true, grande: true });
  if (datos.exentoClp > 0) doc.columnas2('  Incluye exento', formatearClp(datos.exentoClp));
  if (datos.redondeoClp !== 0) {
    doc.columnas2('Redondeo efectivo', formatearClp(datos.redondeoClp));
    doc.columnas2('Total a pagar', formatearClp(datos.totalCobradoClp), { negrita: true });
  }
  if (datos.medioPago === 'EFECTIVO') {
    doc.columnas2('Efectivo', formatearClp(datos.pagadoClp));
    doc.columnas2('Vuelto', formatearClp(datos.vueltoClp), { negrita: true });
  } else {
    doc.columnas2(`Pagado con ${NOMBRE_MEDIO[datos.medioPago]}`, formatearClp(datos.pagadoClp));
  }
  doc.separador();

  for (const leyenda of otras) doc.texto(leyenda, { alinear: 'CENTRO' });
  if (datos.motivoSinDocumento === 'VOUCHER_ES_BOLETA') {
    doc.texto('La boleta es el voucher de la tarjeta', { alinear: 'CENTRO' });
  }
  if (datos.documento?.folioExterno) {
    doc.texto(`Folio e-Boleta SII: ${datos.documento.folioExterno}`, { alinear: 'CENTRO' });
  }
  doc.avance();
  doc.texto('Gracias por su compra', { alinear: 'CENTRO' });

  doc.abrirCajon =
    Boolean(datos.abrirCajon) && datos.medioPago === 'EFECTIVO' && !datos.reimpresion;
  return doc;
}
