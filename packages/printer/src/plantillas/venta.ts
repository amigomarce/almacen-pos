import { formatearCantidad, formatearClp, type MedioPago, type Unidad } from '@almacen/core';
import { LEYENDA_COMPROBANTE_VENTA } from '@almacen/dte';
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
  /** Neto e IVA del documento (solo boletas válidas; se calculan si faltan). */
  netoClp?: number;
  ivaClp?: number;
  /** Tasa de IVA vigente, para el desglose impreso. */
  tasaIva?: number;
  documento: {
    /** 39 = afecta, 41 = exenta. Solo en boletas emitidas por la caja. */
    tipoDte?: 39 | 41 | null;
    folio?: number | null;
    leyendas: readonly string[];
    folioExterno: string | null;
    validoComoBoleta: boolean;
  } | null;
  /** Resolución que autoriza la emisión (se imprime en la boleta válida). */
  resolucion?: { numero: number; fecha: string } | null;
  motivoSinDocumento: 'VOUCHER_ES_BOLETA' | 'TOTAL_CERO' | null;
  anulada: boolean;
  /** Copia impresa después (no en el momento de la venta). */
  reimpresion?: boolean;
  /** Abrir el cajón al imprimir (solo tiene sentido en efectivo). */
  abrirCajon?: boolean;
  /** Venta fiada (ADR-022): a cuenta de quién y su saldo después de la venta. */
  fiado?: { cliente: string; saldoClp: number } | null;
}

/**
 * Comprobante de venta o boleta electrónica. Con la modalidad `PUENTE_MANUAL` (o `MOCK`)
 * el papel SIEMPRE dice "NO VÁLIDO COMO BOLETA". Con `SII_DIRECTO` imprime la boleta válida
 * con folio, desglose de IVA, leyenda de verificación y resolución. El timbre PDF417 es
 * opcional desde la Res. Ex. 207/2025: esta plantilla no lo imprime (el TED va en el XML).
 */
export function ticketVenta(datos: DatosTicketVenta, columnas: number): Documento {
  const doc = new Documento(columnas);
  const valido = datos.documento?.validoComoBoleta === true;
  const [primera, ...otras] = datos.documento?.leyendas ?? [LEYENDA_COMPROBANTE_VENTA];

  encabezadoLocal(doc, datos.local);
  doc.separador();

  if (datos.anulada)
    doc.texto('*** ANULADA ***', { alinear: 'CENTRO', negrita: true, grande: true });
  if (datos.reimpresion) doc.texto('REIMPRESIÓN', { alinear: 'CENTRO', negrita: true });

  if (valido) {
    doc.texto(tituloBoleta(datos.documento?.tipoDte), { alinear: 'CENTRO', negrita: true });
    if (datos.documento?.folio !== undefined && datos.documento.folio !== null) {
      doc.texto(`N° ${datos.documento.folio}`, { alinear: 'CENTRO', negrita: true });
    }
    doc.separador();
    doc.columnas2(fechaHora(datos.fecha), `Cajero: ${datos.cajero}`);
  } else {
    doc.texto(primera ?? LEYENDA_COMPROBANTE_VENTA, { alinear: 'CENTRO', negrita: true });
    doc.separador();
    doc.texto(`Venta N° ${datos.numero}`, { negrita: true });
    doc.columnas2(fechaHora(datos.fecha), `Cajero: ${datos.cajero}`);
  }
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
  if (valido) {
    if (datos.documento?.tipoDte !== 41) {
      const { neto, iva } = desgloseIva(datos);
      doc.columnas2('  Neto', formatearClp(neto));
      doc.columnas2(`  IVA ${datos.tasaIva ?? 19}%`, formatearClp(iva));
    }
    if (datos.exentoClp > 0) doc.columnas2('  Exento', formatearClp(datos.exentoClp));
  } else if (datos.exentoClp > 0) {
    doc.columnas2('  Incluye exento', formatearClp(datos.exentoClp));
  }
  if (datos.redondeoClp !== 0) {
    doc.columnas2('Redondeo efectivo', formatearClp(datos.redondeoClp));
    doc.columnas2('Total a pagar', formatearClp(datos.totalCobradoClp), { negrita: true });
  }
  if (datos.medioPago === 'FIADO') {
    doc.texto(`FIADO - a cuenta de ${datos.fiado?.cliente ?? '?'}`, { negrita: true });
    if (datos.fiado) doc.columnas2('Saldo de la cuenta', formatearClp(datos.fiado.saldoClp));
  } else if (datos.medioPago === 'EFECTIVO') {
    doc.columnas2('Efectivo', formatearClp(datos.pagadoClp));
    doc.columnas2('Vuelto', formatearClp(datos.vueltoClp), { negrita: true });
  } else {
    doc.columnas2(`Pagado con ${NOMBRE_MEDIO[datos.medioPago]}`, formatearClp(datos.pagadoClp));
  }
  doc.separador();

  if (valido) {
    doc.texto('Verifique documento en www.sii.cl', { alinear: 'CENTRO' });
    if (datos.resolucion) {
      doc.texto(`Resolución SII N° ${datos.resolucion.numero} de ${datos.resolucion.fecha}`, {
        alinear: 'CENTRO',
      });
    }
  } else {
    for (const leyenda of otras) doc.texto(leyenda, { alinear: 'CENTRO' });
    if (datos.motivoSinDocumento === 'VOUCHER_ES_BOLETA') {
      doc.texto('La boleta es el voucher de la tarjeta', { alinear: 'CENTRO' });
    }
    if (datos.documento?.folioExterno) {
      doc.texto(`Folio e-Boleta SII: ${datos.documento.folioExterno}`, { alinear: 'CENTRO' });
    }
  }
  doc.avance();
  doc.texto('Gracias por su compra', { alinear: 'CENTRO' });

  doc.abrirCajon =
    Boolean(datos.abrirCajon) && datos.medioPago === 'EFECTIVO' && !datos.reimpresion;
  return doc;
}

function tituloBoleta(tipoDte: 39 | 41 | null | undefined): string {
  return tipoDte === 41 ? 'BOLETA ELECTRÓNICA EXENTA' : 'BOLETA ELECTRÓNICA';
}

/** Neto e IVA del total afecto. Si el servidor no los manda, se derivan del total bruto. */
function desgloseIva(datos: DatosTicketVenta): { neto: number; iva: number } {
  if (datos.netoClp !== undefined && datos.ivaClp !== undefined) {
    return { neto: datos.netoClp, iva: datos.ivaClp };
  }
  const afecto = Math.max(0, datos.totalClp - datos.exentoClp);
  const neto = datos.netoClp ?? Math.round(afecto / 1.19);
  return { neto, iva: datos.ivaClp ?? afecto - neto };
}
