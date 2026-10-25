import { calcularCalidad } from './calidad.js';
import type { MapeoCategorias, ViaCategoria } from './categorias.js';
import { deduplicar } from './deduplicar.js';
import type { UnidadNeta } from './formato.js';
import type { Candidato, IdFuente, Origen } from './lector.js';
import { CatalogoMarcas } from './marcas.js';
import { normalizarProducto } from './nombre.js';

/** Una fila de `seed_products`. */
export interface ProductoSemilla {
  barcode: string;
  /** Nombre de góndola: "Marca Producto Formato". */
  name: string;
  brand: string | null;
  /** Solo el producto, sin marca ni formato. */
  productName: string;
  quantityText: string | null;
  netUnit: UnidadNeta | null;
  /** Contenido neto entero en la unidad base (g, ml o unidades). */
  netQty: number | null;
  categorySlug: string;
  categoryVia: ViaCategoria | 'CURADO';
  imageUrl: string | null;
  source: IdFuente;
  sources: IdFuente[];
  origin: Origen;
  qualityScore: number;
  /** ISO 8601 de la última modificación en la fuente. */
  updatedAt: string | null;
}

export interface ResultadoConstruccion {
  productos: ProductoSemilla[];
  /** Códigos únicos que se descartaron por no tener nombre (ni en ninguna fuente). */
  sinNombre: number;
}

/**
 * Pipeline puro: deduplica, unifica marcas, normaliza nombres, categoriza y puntúa.
 * `candidatos` incluye los de la lista curada (fuente `curado`).
 */
export function construirSemilla(
  candidatos: Iterable<Candidato>,
  mapeo: MapeoCategorias,
  marcasCanonicas: Iterable<string>,
): ResultadoConstruccion {
  const fusionados = deduplicar(candidatos);
  const marcas = new CatalogoMarcas(marcasCanonicas);
  for (const f of fusionados) marcas.agregar(f.marca);

  const productos: ProductoSemilla[] = [];
  let sinNombre = 0;
  for (const f of fusionados) {
    if (f.nombre === '') {
      sinNombre++;
      continue;
    }
    const n = normalizarProducto({
      nombre: f.nombre,
      marca: marcas.canonica(f.marca),
      cantidad: f.cantidad,
    });
    const cat = f.categoriaSlug
      ? { slug: f.categoriaSlug, via: 'CURADO' as const }
      : mapeo.categorizar(f.categoriasTags, f.fuente, n.producto);
    productos.push({
      barcode: f.barcode,
      name: n.nombre,
      brand: n.marca || null,
      productName: n.producto || n.nombre,
      quantityText: n.formato?.texto ?? null,
      netUnit: n.formato?.unidad ?? null,
      netQty: n.formato?.cantidad ?? null,
      categorySlug: cat.slug,
      categoryVia: cat.via,
      imageUrl: f.imagen || null,
      source: f.fuente,
      sources: f.fuentes,
      origin: f.origen,
      qualityScore: calcularCalidad({
        origen: f.origen,
        tieneNombre: n.producto !== '',
        tieneMarca: n.marca !== '',
        tieneFormato: n.formato !== null,
        viaCategoria: cat.via === 'CURADO' ? 'ETIQUETA' : cat.via,
        tieneImagen: f.imagen !== '',
      }),
      updatedAt: f.modificado === null ? null : new Date(f.modificado * 1000).toISOString(),
    });
  }
  return { productos, sinNombre };
}
