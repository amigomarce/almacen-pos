import { formatearClp, MEDIOS_PAGO, type CuadraturaCaja } from '@almacen/core';
import { Documento } from '../documento.js';
import { fechaHora, NOMBRE_MEDIO, type DatosLocal } from '../formato.js';
import { encabezadoLocal } from './encabezado.js';

export interface DatosTicketCierre {
  local: DatosLocal;
  caja: string;
  abiertaEn: Date;
  abiertaPor: string;
  cerradaEn: Date;
  cerradaPor: string;
  resumen: CuadraturaCaja;
  efectivoContadoClp: number;
  /** Contado − esperado. */
  diferenciaClp: number;
  /** Retiros e ingresos de efectivo del turno, con su motivo (detalle para el dueño). */
  movimientos?: { tipo: 'RETIRO' | 'INGRESO'; montoClp: number; motivo: string }[];
}

export function textoDiferencia(diferenciaClp: number): string {
  if (diferenciaClp === 0) return 'CUADRA';
  return diferenciaClp > 0
    ? `SOBRAN ${formatearClp(diferenciaClp)}`
    : `FALTAN ${formatearClp(-diferenciaClp)}`;
}

export function ticketCierre(datos: DatosTicketCierre, columnas: number): Documento {
  const { resumen: r } = datos;
  const doc = new Documento(columnas);
  encabezadoLocal(doc, datos.local);
  doc.separador();
  doc.texto('CIERRE DE CAJA', { alinear: 'CENTRO', negrita: true, grande: true });
  doc.texto(datos.caja, { alinear: 'CENTRO' });
  doc.columnas2('Apertura', fechaHora(datos.abiertaEn));
  doc.texto(`por ${datos.abiertaPor}`, { alinear: 'DERECHA' });
  doc.columnas2('Cierre', fechaHora(datos.cerradaEn));
  doc.texto(`por ${datos.cerradaPor}`, { alinear: 'DERECHA' });
  doc.separador();

  doc.columnas2('Ventas', String(r.cantidadVentas));
  for (const medio of MEDIOS_PAGO) {
    const m = r.porMedio[medio];
    // El fiado solo aparece en los almacenes que lo usan.
    if (medio === 'FIADO' && m.cantidad === 0) continue;
    doc.columnas2(`${NOMBRE_MEDIO[medio]} (${m.cantidad})`, formatearClp(m.cobradoClp));
  }
  doc.columnas2('Total cobrado', formatearClp(r.totalCobradoClp), { negrita: true });
  if (r.redondeoClp !== 0) doc.columnas2('  Redondeo efectivo', formatearClp(r.redondeoClp));
  if (r.anuladas.cantidad > 0) {
    doc.columnas2(`Anuladas (${r.anuladas.cantidad})`, formatearClp(r.anuladas.totalClp));
  }
  if (r.abonos.cantidad > 0) {
    doc.columnas2(`Abonos de fiado (${r.abonos.cantidad})`, formatearClp(r.abonos.totalClp));
  }
  if (r.devoluciones.cantidad > 0) {
    doc.columnas2(
      `Devoluciones (${r.devoluciones.cantidad})`,
      formatearClp(r.devoluciones.totalClp),
    );
  }
  doc.separador();

  doc.columnas2('Efectivo inicial', formatearClp(r.efectivoInicialClp));
  doc.columnas2('+ Cobrado en efectivo', formatearClp(r.porMedio.EFECTIVO.cobradoClp));
  if (r.movimientos.ingresosClp > 0) {
    doc.columnas2('+ Ingresos de efectivo', formatearClp(r.movimientos.ingresosClp));
  }
  if (r.movimientos.retirosClp > 0) {
    doc.columnas2('- Retiros de efectivo', formatearClp(r.movimientos.retirosClp));
  }
  if (r.devoluciones.efectivoClp > 0) {
    doc.columnas2('- Devoluciones efectivo', formatearClp(r.devoluciones.efectivoClp));
  }
  if (r.abonos.efectivoClp > 0) {
    doc.columnas2('+ Abonos fiado efectivo', formatearClp(r.abonos.efectivoClp));
  }
  doc.columnas2('= Esperado en caja', formatearClp(r.efectivoEsperadoClp), { negrita: true });
  doc.columnas2('Contado', formatearClp(datos.efectivoContadoClp));
  doc.texto(textoDiferencia(datos.diferenciaClp), {
    alinear: 'CENTRO',
    negrita: true,
    grande: true,
  });

  if (datos.movimientos && datos.movimientos.length > 0) {
    doc.separador();
    doc.texto('Retiros e ingresos', { negrita: true });
    for (const m of datos.movimientos) {
      const signo = m.tipo === 'RETIRO' ? '-' : '+';
      doc.columnas2(m.motivo, `${signo}${formatearClp(m.montoClp)}`);
    }
  }

  if (r.anuladas.cantidad > 0) {
    doc.separador();
    // ADR-001 §5: recordatorio de notas de crédito en el cierre.
    doc.texto('Hay ventas anuladas: revisa si falta anular boletas en sii.cl o pagos con tarjeta.');
  }
  doc.separador();
  doc.avance();
  doc.texto('Firma: ____________________');
  return doc;
}
