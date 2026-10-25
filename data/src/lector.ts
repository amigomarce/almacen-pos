import { esCodigoDeBalanza, normalizarCodigoBarras, validarCodigoBarras } from '@almacen/core';
import { esDeChile } from './medicion.js';

export type IdFuente = 'curado' | 'off' | 'opff' | 'obf' | 'opf';

/**
 * Por qué el producto entra a la semilla:
 * - `TAG_CHILE`: la ficha dice que se vende en Chile (`countries_tags` ∋ `en:chile`).
 * - `PREFIJO_780`: código GS1 Chile pero sin la etiqueta (muchas son exportaciones): entra
 *   con quality_score más bajo.
 * - `CURADO`: lista propia verificada (`data/curado/`).
 */
export type Origen = 'TAG_CHILE' | 'PREFIJO_780' | 'CURADO';

/** Producto tal como viene de una fuente, con el código ya validado y en forma canónica. */
export interface Candidato {
  barcode: string;
  fuente: IdFuente;
  origen: Origen;
  nombre: string;
  marca: string;
  cantidad: string;
  categoriasTags: string[];
  /** Categoría ya decidida (solo la lista curada la trae; OFF trae etiquetas). */
  categoriaSlug?: string;
  imagen: string;
  /** Unix (s) de la última modificación en la fuente; `null` si no se sabe. */
  modificado: number | null;
}

export const COLUMNAS_EXPORT = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'quantity',
  'categories_tags',
  'countries_tags',
  'image_url',
  'last_modified_t',
] as const;
export type FilaExport = Record<(typeof COLUMNAS_EXPORT)[number], string>;

export type MotivoDescarte = 'FUERA_DE_CHILE' | 'EAN_FORMATO' | 'EAN_DIGITO' | 'EAN_BALANZA';

export type ResultadoLectura =
  { ok: true; candidato: Candidato } | { ok: false; motivo: MotivoDescarte };

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();

export function lista(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

/** Convierte una fila del export en candidato, o dice por qué se descarta. */
export function leerFila(fila: FilaExport, fuente: Exclude<IdFuente, 'curado'>): ResultadoLectura {
  const codigo = fila.code.trim();
  const r = validarCodigoBarras(codigo);
  const barcode = normalizarCodigoBarras(codigo);
  const etiquetaChile = esDeChile(fila.countries_tags);
  const prefijoChile = barcode?.startsWith('780') ?? false;

  if (!etiquetaChile && !prefijoChile) return { ok: false, motivo: 'FUERA_DE_CHILE' };
  if (!r.valido || barcode === null) {
    return {
      ok: false,
      motivo: !r.valido && r.motivo === 'FORMATO' ? 'EAN_FORMATO' : 'EAN_DIGITO',
    };
  }
  if (esCodigoDeBalanza(barcode)) return { ok: false, motivo: 'EAN_BALANZA' };

  const modificado = Number.parseInt(fila.last_modified_t, 10);
  return {
    ok: true,
    candidato: {
      barcode,
      fuente,
      origen: etiquetaChile ? 'TAG_CHILE' : 'PREFIJO_780',
      nombre: limpiar(fila.product_name) || limpiar(fila.generic_name),
      marca: limpiar(lista(fila.brands)[0] ?? ''),
      cantidad: limpiar(fila.quantity),
      categoriasTags: lista(fila.categories_tags),
      imagen: limpiar(fila.image_url),
      modificado: Number.isFinite(modificado) ? modificado : null,
    },
  };
}
