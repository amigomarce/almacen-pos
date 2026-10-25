import type { ViaCategoria } from './categorias.js';
import type { Origen } from './lector.js';

export interface DatosCalidad {
  origen: Origen;
  tieneNombre: boolean;
  tieneMarca: boolean;
  tieneFormato: boolean;
  viaCategoria: ViaCategoria;
  tieneImagen: boolean;
}

/** Puntos por campo; suman 100. */
export const PUNTOS = {
  nombre: 30,
  marca: 20,
  formato: 20,
  /** Categoría por etiqueta de OFF. Adivinada por palabra o por la fuente: la mitad. */
  categoria: 20,
  imagen: 10,
} as const;

/**
 * quality_score 0–100: qué tan lista viene la ficha para que la caja solo pida precio y stock.
 * - Curado (verificado por nosotros) = 100.
 * - Solo prefijo 780, sin etiqueta Chile = la mitad: puede ser un producto de exportación.
 */
export function calcularCalidad(d: DatosCalidad): number {
  if (d.origen === 'CURADO') return 100;
  let puntos = 0;
  if (d.tieneNombre) puntos += PUNTOS.nombre;
  if (d.tieneMarca) puntos += PUNTOS.marca;
  if (d.tieneFormato) puntos += PUNTOS.formato;
  if (d.viaCategoria === 'ETIQUETA') puntos += PUNTOS.categoria;
  else if (d.viaCategoria === 'PALABRA' || d.viaCategoria === 'FUENTE') {
    puntos += PUNTOS.categoria / 2;
  }
  if (d.tieneImagen) puntos += PUNTOS.imagen;
  return d.origen === 'PREFIJO_780' ? Math.round(puntos / 2) : puntos;
}
