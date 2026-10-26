/**
 * API pública de @almacen/data para otros paquetes (apps/server). Solo exporta piezas puras y
 * la escritura de la semilla; los CLI (build, medir) no se importan desde aquí.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MapeoCategorias, cargarTaxonomia } from './categorias.js';
import { parsearCsv } from './csv.js';

export { LICENCIA, TEXTO_ATRIBUCION, URL_LICENCIA } from './atribucion.js';
export {
  MapeoCategorias,
  SIN_CATEGORIA,
  cargarTaxonomia,
  type Categoria,
  type CategoriaAsignada,
} from './categorias.js';
export type { ProductoSemilla } from './construir.js';
export { parsearCsv } from './csv.js';
export type { UnidadNeta } from './formato.js';
export { CatalogoMarcas } from './marcas.js';
export { normalizarProducto, type ProductoNormalizado } from './nombre.js';
export { VERSION_ESQUEMA, escribirSemilla, type ContenidoSemilla } from './sqlite.js';

/**
 * Carpeta `data/` (CSV editables y `out/`). En el instalador se apunta con
 * `ALMACEN_DATA_DIR` a los recursos empaquetados; en el repo se usa la ubicación del paquete.
 */
const DIR_DATA_POR_DEFECTO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DIR_DATA = process.env['ALMACEN_DATA_DIR']?.trim() || DIR_DATA_POR_DEFECTO;

/** Ruta por defecto de la semilla generada por `pnpm data:build`. */
export const RUTA_SEMILLA = join(DIR_DATA, 'out', 'seed.sqlite');

export interface Normalizacion {
  mapeo: MapeoCategorias;
  /** Formas oficiales de marcas (`data/marcas.csv`). */
  marcasCanonicas: string[];
}

/** Carga los CSV editables de categorías y marcas (los mismos que usa `pnpm data:build`). */
export function cargarNormalizacion(dir: string = DIR_DATA): Normalizacion {
  const leer = (archivo: string) => readFileSync(join(dir, archivo), 'utf8');
  const taxonomia = cargarTaxonomia(leer('categorias.csv'));
  return {
    mapeo: new MapeoCategorias(leer('mapeo_categorias.csv'), taxonomia, leer('mapeo_palabras.csv')),
    marcasCanonicas: parsearCsv(leer('marcas.csv')).map((f) => f['marca'] ?? ''),
  };
}
