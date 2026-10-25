import type { Candidato, IdFuente, Origen } from './lector.js';

/** Orden de confianza de las fuentes: la primera manda cuando dos traen el mismo dato. */
export const PRIORIDAD_FUENTE: readonly IdFuente[] = ['curado', 'off', 'opff', 'obf', 'opf'];

const PRIORIDAD_ORIGEN: readonly Origen[] = ['CURADO', 'TAG_CHILE', 'PREFIJO_780'];

export interface Fusionado extends Candidato {
  /** Todas las fuentes que traían este código, en orden de prioridad. */
  fuentes: IdFuente[];
}

function comparar(a: Candidato, b: Candidato): number {
  const pa = PRIORIDAD_FUENTE.indexOf(a.fuente);
  const pb = PRIORIDAD_FUENTE.indexOf(b.fuente);
  if (pa !== pb) return pa - pb;
  // Misma fuente (p. ej. el mismo GTIN cargado como UPC-A y como EAN-13): el más reciente.
  return (b.modificado ?? 0) - (a.modificado ?? 0);
}

const primero = <T>(
  lista: Candidato[],
  f: (c: Candidato) => T,
  vacio: (v: T) => boolean,
): T | undefined => lista.map(f).find((v) => !vacio(v));

/**
 * Une los candidatos que comparten código de barras. Cada campo se toma de la fuente de
 * mayor prioridad que lo tenga (si OFF no trae marca pero OBF sí, se usa la de OBF).
 * Basta con que una fuente diga "Chile" para que el producto cuente como de Chile.
 */
export function deduplicar(candidatos: Iterable<Candidato>): Fusionado[] {
  const grupos = new Map<string, Candidato[]>();
  for (const c of candidatos) {
    const g = grupos.get(c.barcode);
    if (g) g.push(c);
    else grupos.set(c.barcode, [c]);
  }

  const vacioTexto = (s: string) => s === '';
  const resultado: Fusionado[] = [];
  for (const [barcode, grupo] of grupos) {
    grupo.sort(comparar);
    const [ganador] = grupo;
    if (!ganador) continue;
    const origen =
      PRIORIDAD_ORIGEN.find((o) => grupo.some((c) => c.origen === o)) ?? ganador.origen;
    const categoriaSlug = grupo.find((c) => c.categoriaSlug)?.categoriaSlug;
    const fechas = grupo.map((c) => c.modificado).filter((m): m is number => m !== null);
    resultado.push({
      barcode,
      fuente: ganador.fuente,
      origen,
      nombre: primero(grupo, (c) => c.nombre, vacioTexto) ?? '',
      marca: primero(grupo, (c) => c.marca, vacioTexto) ?? '',
      cantidad: primero(grupo, (c) => c.cantidad, vacioTexto) ?? '',
      categoriasTags:
        primero(
          grupo,
          (c) => c.categoriasTags,
          (t) => t.length === 0,
        ) ?? [],
      imagen: primero(grupo, (c) => c.imagen, vacioTexto) ?? '',
      modificado: fechas.length > 0 ? Math.max(...fechas) : null,
      fuentes: [...new Set(grupo.map((c) => c.fuente))],
      ...(categoriaSlug ? { categoriaSlug } : {}),
    });
  }
  return resultado.sort((a, b) => a.barcode.localeCompare(b.barcode));
}
