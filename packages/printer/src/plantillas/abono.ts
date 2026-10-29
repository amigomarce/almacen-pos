import { formatearClp } from '@almacen/core';
import { Documento } from '../documento.js';
import { fechaHora, NOMBRE_MEDIO, type DatosLocal } from '../formato.js';
import { encabezadoLocal } from './encabezado.js';

export interface DatosReciboAbono {
  local: DatosLocal;
  cliente: string;
  fecha: Date;
  cajero: string;
  montoClp: number;
  medioPago: 'EFECTIVO' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA';
  /** Lo que queda debiendo después del abono. */
  saldoClp: number;
}

/** Recibo de abono al fiado (ADR-022). No es un documento tributario. */
export function reciboAbono(datos: DatosReciboAbono, columnas: number): Documento {
  const doc = new Documento(columnas);
  encabezadoLocal(doc, datos.local);
  doc.separador();
  doc.texto('ABONO A CUENTA', { alinear: 'CENTRO', negrita: true, grande: true });
  doc.texto(datos.cliente, { alinear: 'CENTRO', negrita: true });
  doc.columnas2('Fecha', fechaHora(datos.fecha));
  doc.columnas2('Atendió', datos.cajero);
  doc.separador();
  doc.columnas2('Abono', formatearClp(datos.montoClp), { negrita: true });
  doc.columnas2('Pagado con', NOMBRE_MEDIO[datos.medioPago]);
  doc.columnas2('Saldo pendiente', formatearClp(datos.saldoClp), { negrita: true });
  doc.separador();
  doc.texto('Recibo interno - no es boleta', { alinear: 'CENTRO' });
  doc.avance(2);
  return doc;
}
