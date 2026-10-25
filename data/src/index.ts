/**
 * API pública de @almacen/data para otros paquetes (apps/server). Solo exporta piezas puras y
 * la escritura de la semilla; los CLI (build, medir) no se importan desde aquí.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Carpeta `data/` del repo (CSV editables y `out/`). */
export const DIR_DATA = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ruta por defecto de la semilla generada por `pnpm data:build`. */
export const RUTA_SEMILLA = join(DIR_DATA, 'out', 'seed.sqlite');
