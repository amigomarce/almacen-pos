import { Documento } from '../documento.js';
import type { PaginaCodigos } from '../codificacion.js';

/**
 * Ticket para probar una impresora nueva: ancho, acentos (página de códigos), letra grande,
 * negrita, alineación, corte y cajón.
 */
export function ticketPrueba(opciones: {
  columnas: number;
  paginaCodigos: PaginaCodigos;
  anchoMm?: number;
  abrirCajon?: boolean;
}): Documento {
  const doc = new Documento(opciones.columnas);
  doc.texto('PRUEBA DE IMPRESIÓN', { alinear: 'CENTRO', negrita: true, grande: true });
  doc.texto(
    `${opciones.anchoMm ? `Papel ${opciones.anchoMm} mm · ` : ''}${opciones.columnas} columnas · ${opciones.paginaCodigos}`,
    { alinear: 'CENTRO' },
  );
  doc.separador('=');
  // Regla: la última cifra debe quedar justo en el borde derecho.
  const regla = Array.from({ length: opciones.columnas }, (_, i) => String((i + 1) % 10)).join('');
  doc.texto(regla);
  doc.separador();
  doc.texto('Acentos: áéíóú ÁÉÍÓÚ ü');
  doc.texto('Eñes: ñandú Ñuñoa · ¿Precio? ¡Oferta!');
  doc.texto('Venta N° 1 · $1.290 · 1,250 kg');
  doc.separador();
  doc.texto('Negrita', { negrita: true });
  doc.texto('GRANDE', { grande: true });
  doc.texto('Izquierda');
  doc.texto('Centro', { alinear: 'CENTRO' });
  doc.texto('Derecha', { alinear: 'DERECHA' });
  doc.separador();
  doc.texto(
    'Si los acentos y la ñ se ven bien, la página de códigos es correcta. Si la regla se corta o sobra espacio, ajusta las columnas.',
  );
  doc.abrirCajon = opciones.abrirCajon ?? false;
  return doc;
}
