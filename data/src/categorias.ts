import { parsearCsv } from './csv.js';
import type { IdFuente } from './lector.js';

export interface Categoria {
  slug: string;
  nombre: string;
  padre: string | null;
}

export const SIN_CATEGORIA = 'otros';

/** Lee `data/categorias.csv` (slug,nombre,padre) y valida que cada padre exista. */
export function cargarTaxonomia(csv: string): Map<string, Categoria> {
  const mapa = new Map<string, Categoria>();
  for (const f of parsearCsv(csv)) {
    const slug = f['slug'] ?? '';
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`categorias.csv: slug inválido "${slug}"`);
    if (mapa.has(slug)) throw new Error(`categorias.csv: slug repetido "${slug}"`);
    mapa.set(slug, { slug, nombre: f['nombre'] ?? slug, padre: f['padre'] || null });
  }
  for (const c of mapa.values()) {
    if (c.padre && !mapa.has(c.padre)) {
      throw new Error(`categorias.csv: "${c.slug}" tiene un padre que no existe: "${c.padre}"`);
    }
  }
  if (!mapa.has(SIN_CATEGORIA)) throw new Error(`categorias.csv: falta "${SIN_CATEGORIA}"`);
  return mapa;
}

/**
 * Clave de una etiqueta de OFF sin prefijo de idioma y sin tildes ni mayúsculas:
 * "en:Bebidas gaseosas" y "es:bebidas-gaseosas" → "bebidas-gaseosas".
 */
export function claveEtiqueta(tag: string): string {
  return tag
    .replace(/^[a-z]{2}:/i, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Categoría por defecto si ninguna etiqueta calza, según el proyecto de origen. */
const POR_FUENTE: Partial<Record<IdFuente, string>> = {
  obf: 'aseo-personal',
  opff: 'mascotas',
};

interface Regla {
  slug: string;
  prioridad: number;
}

/** Cómo se decidió la categoría (la de PALABRA es una adivinanza y vale menos en el score). */
export type ViaCategoria = 'ETIQUETA' | 'PALABRA' | 'FUENTE' | 'NINGUNA';

export interface CategoriaAsignada {
  slug: string;
  via: ViaCategoria;
}

/**
 * Traduce `categories_tags` de OFF a nuestra taxonomía con `data/mapeo_categorias.csv`
 * (off_tag,categoria_slug,prioridad). Gana la etiqueta con mayor prioridad (1 = genérica,
 * 2 = normal, 3 = muy específica); en empate, la que aparece más tarde en la lista de OFF
 * (OFF ordena de lo general a lo específico).
 *
 * Si ninguna etiqueta calza, se busca en el nombre del producto la primera palabra de
 * `data/mapeo_palabras.csv` (palabra,categoria_slug): "Leche descremada" → leches.
 */
export class MapeoCategorias {
  private readonly reglas = new Map<string, Regla>();
  private readonly palabras = new Map<string, string>();

  constructor(csv: string, taxonomia: Map<string, Categoria>, csvPalabras = '') {
    for (const f of parsearCsv(csvPalabras)) {
      const palabra = claveEtiqueta(f['palabra'] ?? '');
      const slug = f['categoria_slug'] ?? '';
      if (palabra === '' || palabra.includes('-')) {
        throw new Error(`mapeo_palabras.csv: palabra inválida "${f['palabra'] ?? ''}"`);
      }
      if (!taxonomia.has(slug)) {
        throw new Error(`mapeo_palabras.csv ("${palabra}"): categoría desconocida "${slug}"`);
      }
      this.palabras.set(palabra, slug);
    }
    for (const f of parsearCsv(csv)) {
      const tag = f['off_tag'] ?? '';
      const donde = `mapeo_categorias.csv ("${tag}")`;
      const clave = claveEtiqueta(tag);
      const slug = f['categoria_slug'] ?? '';
      const prioridad = f['prioridad'] ? Number(f['prioridad']) : 2;
      if (clave === '') throw new Error(`mapeo_categorias.csv: hay una fila con off_tag vacío`);
      if (!taxonomia.has(slug)) {
        throw new Error(`${donde}: categoría desconocida "${slug}"`);
      }
      if (!Number.isInteger(prioridad) || prioridad < 1) {
        throw new Error(`${donde}: prioridad inválida "${f['prioridad'] ?? ''}"`);
      }
      const previa = this.reglas.get(clave);
      if (previa && previa.slug !== slug) {
        throw new Error(`${donde}: "${clave}" ya está mapeada a "${previa.slug}"`);
      }
      this.reglas.set(clave, { slug, prioridad });
    }
  }

  /** Categoría de nuestra taxonomía para un producto. `nombre` sin la marca, idealmente. */
  categorizar(tags: readonly string[], fuente: IdFuente, nombre = ''): CategoriaAsignada {
    let mejor: Regla | null = null;
    for (const tag of tags) {
      const regla = this.reglas.get(claveEtiqueta(tag));
      if (regla && (mejor === null || regla.prioridad >= mejor.prioridad)) mejor = regla;
    }
    if (mejor) return { slug: mejor.slug, via: 'ETIQUETA' };
    // En cosmética y mascotas la fuente es más confiable que el nombre ("Jabón de leche").
    const porFuente = POR_FUENTE[fuente];
    if (porFuente) return { slug: porFuente, via: 'FUENTE' };
    for (const p of nombre.split(/[\s,.;:()/+&-]+/)) {
      const slug = this.palabras.get(claveEtiqueta(p));
      if (slug) return { slug, via: 'PALABRA' };
    }
    return { slug: SIN_CATEGORIA, via: 'NINGUNA' };
  }
}
