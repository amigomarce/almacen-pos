/** Semilla pequeña para tests, creada con el mismo escritor que usa `pnpm data:build`. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LICENCIA,
  TEXTO_ATRIBUCION,
  URL_LICENCIA,
  escribirSemilla,
  type Categoria,
  type ProductoSemilla,
} from '@almacen/data';

const categorias: Categoria[] = [
  { slug: 'otros', nombre: 'Otros', padre: null },
  { slug: 'lacteos-huevos', nombre: 'Lácteos y huevos', padre: null },
  { slug: 'quesos', nombre: 'Quesos', padre: 'lacteos-huevos' },
];

const base: Omit<ProductoSemilla, 'barcode' | 'name' | 'productName'> = {
  brand: null,
  quantityText: null,
  netUnit: null,
  netQty: null,
  categorySlug: 'otros',
  categoryVia: 'NINGUNA',
  imageUrl: null,
  source: 'off',
  sources: ['off'],
  origin: 'TAG_CHILE',
  qualityScore: 30,
  updatedAt: null,
};

export const PRODUCTOS_FIXTURE: ProductoSemilla[] = [
  {
    ...base,
    barcode: '7802920000749',
    name: 'Colún Mi Quesillo Fresco y Natural 320 g',
    brand: 'Colún',
    productName: 'Mi Quesillo Fresco y Natural',
    quantityText: '320 g',
    netUnit: 'G',
    netQty: 320,
    categorySlug: 'quesos',
    categoryVia: 'ETIQUETA',
    imageUrl:
      'https://images.openfoodfacts.org/images/products/780/292/000/0749/front_es.7.400.jpg',
    qualityScore: 100,
  },
  // UPC-A guardado en forma canónica EAN-13 (con 0 adelante).
  { ...base, barcode: '0036000291452', name: 'Producto UPC', productName: 'Producto UPC' },
];

export const META_FIXTURE = {
  license: LICENCIA,
  license_url: URL_LICENCIA,
  attribution: TEXTO_ATRIBUCION,
  sources: JSON.stringify([{ id: 'off', nombre: 'Open Food Facts', export_del: '2026-10-25' }]),
  built_at: '2026-10-25T11:35:19.120Z',
  product_count: String(PRODUCTOS_FIXTURE.length),
};

/** Escribe la semilla en una carpeta temporal y devuelve la ruta. */
export function crearSemillaFixture(meta: Record<string, string> = META_FIXTURE): string {
  const ruta = join(mkdtempSync(join(tmpdir(), 'almacen-semilla-')), 'seed.sqlite');
  escribirSemilla(ruta, {
    productos: PRODUCTOS_FIXTURE,
    taxonomia: new Map(categorias.map((c) => [c.slug, c])),
    plantillas: [],
    meta,
  });
  return ruta;
}
