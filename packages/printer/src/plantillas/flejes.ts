import { formatearClp } from '@almacen/core';
import { Documento } from '../documento.js';
import { fechaHora } from '../formato.js';

/** Un fleje (etiqueta de precio para la góndola). */
export interface DatosFleje {
  nombre: string;
  marca: string | null;
  formato: string | null;
  unidad: 'UN' | 'KG';
  precioClp: number;
  codigo: string | null;
}

/**
 * Flejes de precio para imprimir en la térmica, uno debajo del otro, separados por una línea
 * de corte. El precio va grande; los por peso dicen "/kg".
 */
export function ticketFlejes(
  flejes: readonly DatosFleje[],
  columnas: number,
  fecha: Date = new Date(),
): Documento {
  const doc = new Documento(columnas);
  const dia = fechaHora(fecha).split(' ')[0] ?? '';
  flejes.forEach((f, i) => {
    if (i > 0) {
      doc.avance();
      doc.separador('- ');
      doc.avance();
    }
    doc.texto(f.nombre, { alinear: 'CENTRO', negrita: true });
    const detalle = [f.marca, f.formato].filter(Boolean).join(' · ');
    if (detalle) doc.texto(detalle, { alinear: 'CENTRO' });
    doc.texto(`${formatearClp(f.precioClp)}${f.unidad === 'KG' ? '/kg' : ''}`, {
      alinear: 'CENTRO',
      negrita: true,
      grande: true,
    });
    doc.columnas2(f.codigo ?? '', `Precio al ${dia}`);
  });
  doc.avance(3);
  return doc;
}
