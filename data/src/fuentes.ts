/** Exports CSV (en realidad TSV, UTF-8, gzip) de Open Food Facts y proyectos hermanos. Licencia ODbL. */
export interface Fuente {
  id: 'off' | 'opff' | 'obf' | 'opf';
  nombre: string;
  url: string;
}

export const FUENTES: readonly Fuente[] = [
  {
    id: 'off',
    nombre: 'Open Food Facts',
    url: 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz',
  },
  {
    id: 'opff',
    nombre: 'Open Pet Food Facts',
    url: 'https://static.openpetfoodfacts.org/data/en.openpetfoodfacts.org.products.csv.gz',
  },
  {
    id: 'obf',
    nombre: 'Open Beauty Facts',
    url: 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz',
  },
  {
    id: 'opf',
    nombre: 'Open Products Facts',
    url: 'https://static.openproductsfacts.org/data/en.openproductsfacts.org.products.csv.gz',
  },
];

/**
 * User-Agent que piden los proyectos Open*Facts: `App/Versión (contacto)`.
 * El contacto (email o URL) se configura con `ALMACEN_CONTACTO`; no se commitea.
 */
export const USER_AGENT = `AlmacenPOS-data/0.1 (${process.env['ALMACEN_CONTACTO'] ?? 'contacto-no-configurado'})`;
