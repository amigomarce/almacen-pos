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
    doc.columnas2(`${NOMBRE_MEDIO[medio]} (${m.cantidad})`, formatearClp(m.cobradoClp));
  }
  doc.columnas2('Total cobrado', formatearClp(r.totalCobradoClp), { negrita: true });
  if (r.redondeoClp !== 0) doc.columnas2('  Redondeo efectivo', formatearClp(r.redondeoClp));
  if (r.anuladas.cantidad > 0) {
    doc.columnas2(`Anuladas (${r.anuladas.cantidad})`, formatearClp(r.anuladas.totalClp));
  }
  doc.separador();

  doc.columnas2('Efectivo inicial', formatearClp(r.efectivoInicialClp));
  doc.columnas2('+ Cobrado en efectivo', formatearClp(r.porMedio.EFECTIVO.cobradoClp));
  doc.columnas2('= Esperado en caja', formatearClp(r.efectivoEsperadoClp), { negrita: true });
  doc.columnas2('Contado', formatearClp(datos.efectivoContadoClp));
  doc.texto(textoDiferencia(datos.diferenciaClp), {
    alinear: 'CENTRO',
    negrita: true,
    grande: true,
  });

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
