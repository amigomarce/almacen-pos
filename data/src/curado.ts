import { esCodigoDeBalanza, normalizarCodigoBarras } from '@almacen/core';
import type { Categoria } from './categorias.js';
import { parsearCsv } from './csv.js';
import type { Candidato } from './lector.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee `data/curado/productos.csv`. Solo acepta EAN reales verificados: código válido,
 * quién lo verificó y cuándo. Cualquier fila mala detiene el build (mejor sin producto
 * que con un código inventado).
 */
export function cargarCurado(csv: string, taxonomia: Map<string, Categoria>): Candidato[] {
  const vistos = new Set<string>();
  return parsearCsv(csv).map((f) => {
    const crudo = f['barcode'] ?? '';
    const donde = `curado/productos.csv ("${crudo}")`;
    const barcode = normalizarCodigoBarras(crudo);
    if (barcode === null) throw new Error(`${donde}: código de barras inválido`);
    if (esCodigoDeBalanza(barcode)) {
      throw new Error(`${donde}: es un código de balanza (20–29), no va en la semilla`);
    }
    if (vistos.has(barcode)) throw new Error(`${donde}: código repetido`);
    vistos.add(barcode);
    const nombre = f['nombre'] ?? '';
    if (nombre === '') throw new Error(`${donde}: falta el nombre`);
    if ((f['verificado_por'] ?? '') === '') throw new Error(`${donde}: falta verificado_por`);
    if (!FECHA.test(f['fecha_verificacion'] ?? '')) {
      throw new Error(`${donde}: fecha_verificacion debe ser AAAA-MM-DD`);
    }
    const categoriaSlug = f['categoria_slug'] ?? '';
    if (!taxonomia.has(categoriaSlug)) {
      throw new Error(`${donde}: categoría desconocida "${categoriaSlug}"`);
    }
    return {
      barcode,
      fuente: 'curado',
      origen: 'CURADO',
      nombre,
      marca: f['marca'] ?? '',
      cantidad: f['cantidad'] ?? '',
      categoriasTags: [],
      categoriaSlug,
      imagen: '',
      modificado: null,
    };
  });
}

export interface Plantilla {
  nombre: string;
  categoriaSlug: string;
  unidad: 'UN' | 'KG';
  nota: string;
}

/**
 * Lee `data/curado/plantillas_sin_codigo.csv`. Rechaza cualquier cosa que parezca un código
 * de barras: el código se asigna cuando el dueño escanea el producto por primera vez.
 */
export function cargarPlantillas(csv: string, taxonomia: Map<string, Categoria>): Plantilla[] {
  const vistos = new Set<string>();
  return parsearCsv(csv).map((f) => {
    const columnas = Object.keys(f);
    if (columnas.some((c) => /barcode|codigo|ean/i.test(c))) {
      throw new Error('plantillas_sin_codigo.csv: no puede tener columna de código de barras');
    }
    const nombre = f['nombre'] ?? '';
    const donde = `plantillas_sin_codigo.csv ("${nombre}")`;
    if (nombre === '') throw new Error('plantillas_sin_codigo.csv: hay una fila sin nombre');
    if (Object.values(f).some((v) => /\d{8,}/.test(v))) {
      throw new Error(`${donde}: parece tener un código de barras; las plantillas van sin código`);
    }
    if (vistos.has(nombre.toLowerCase())) throw new Error(`${donde}: nombre repetido`);
    vistos.add(nombre.toLowerCase());
    const categoriaSlug = f['categoria_slug'] ?? '';
    if (!taxonomia.has(categoriaSlug)) {
      throw new Error(`${donde}: categoría desconocida "${categoriaSlug}"`);
    }
    const unidad = f['unidad'];
    if (unidad !== 'UN' && unidad !== 'KG') throw new Error(`${donde}: unidad debe ser UN o KG`);
    return { nombre, categoriaSlug, unidad, nota: f['nota'] ?? '' };
  });
}
