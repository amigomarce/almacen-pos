/**
 * Construye la base semilla: `pnpm data:build [--sin-descarga]`.
 * Descarga los exports a data/raw/ (si cambiaron), filtra Chile + prefijo 780, normaliza,
 * deduplica, categoriza y escribe:
 *   data/out/seed.sqlite      (va en el instalador de la caja; ODbL, ver ADR-004)
 *   data/out/ATRIBUCION.md    (licencia, junto a la semilla)
 *   data/reporte.md           (cobertura, se commitea para ver la evolución)
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LICENCIA, TEXTO_ATRIBUCION, URL_LICENCIA } from './atribucion.js';
import { MapeoCategorias, cargarTaxonomia } from './categorias.js';
import { construirSemilla } from './construir.js';
import { parsearCsv } from './csv.js';
import { cargarCurado, cargarPlantillas } from './curado.js';
import { descargar } from './descarga.js';
import { FUENTES } from './fuentes.js';
import { COLUMNAS_EXPORT, leerFila, type Candidato, type MotivoDescarte } from './lector.js';
import { generarReporte } from './reporte.js';
import { escribirSemilla } from './sqlite.js';
import { abrirArchivo, leerTsv } from './tsv.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(DATA, 'raw');
const OUT = join(DATA, 'out');
const sinDescarga = process.argv.includes('--sin-descarga');
const leer = (archivo: string) => readFileSync(join(DATA, archivo), 'utf8');

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Primero los CSV editables: si alguno está malo, falla antes de leer el GB de OFF.
const taxonomia = cargarTaxonomia(leer('categorias.csv'));
const mapeo = new MapeoCategorias(
  leer('mapeo_categorias.csv'),
  taxonomia,
  leer('mapeo_palabras.csv'),
);
const marcasCanonicas = parsearCsv(leer('marcas.csv')).map((f) => f['marca'] ?? '');
const curado = cargarCurado(leer('curado/productos.csv'), taxonomia);
const plantillas = cargarPlantillas(leer('curado/plantillas_sin_codigo.csv'), taxonomia);

const candidatos: Candidato[] = [...curado];
const descartes: Partial<Record<MotivoDescarte, number>> = {};
const resumenFuentes: {
  nombre: string;
  filas: number;
  candidatos: number;
  exportDel: string | null;
}[] = [];
const metaFuentes: { id: string; nombre: string; url: string; export_del: string | null }[] = [];

for (const fuente of FUENTES) {
  const archivo = join(RAW, fuente.url.split('/').at(-1) ?? `${fuente.id}.csv.gz`);
  console.error(`→ ${fuente.nombre}`);
  const meta = sinDescarga ? null : await descargar(fuente.url, archivo);
  const exportDel = meta?.lastModified
    ? new Date(meta.lastModified).toISOString().slice(0, 10)
    : statSync(archivo).mtime.toISOString().slice(0, 10);
  let filas = 0;
  let deEsta = 0;
  for await (const fila of leerTsv(abrirArchivo(archivo), COLUMNAS_EXPORT)) {
    filas++;
    const r = leerFila(fila, fuente.id);
    if (r.ok) {
      candidatos.push(r.candidato);
      deEsta++;
    } else if (r.motivo !== 'FUERA_DE_CHILE') {
      descartes[r.motivo] = (descartes[r.motivo] ?? 0) + 1;
    }
  }
  resumenFuentes.push({ nombre: fuente.nombre, filas, candidatos: deEsta, exportDel });
  metaFuentes.push({
    id: fuente.id,
    nombre: fuente.nombre,
    url: fuente.url,
    export_del: exportDel,
  });
}

const { productos, sinNombre } = construirSemilla(candidatos, mapeo, marcasCanonicas);
const ahora = new Date().toISOString();

escribirSemilla(join(OUT, 'seed.sqlite'), {
  productos,
  taxonomia,
  plantillas,
  meta: {
    license: LICENCIA,
    license_url: URL_LICENCIA,
    attribution: TEXTO_ATRIBUCION,
    sources: JSON.stringify(metaFuentes),
    built_at: ahora,
    product_count: String(productos.length),
  },
});
copyFileSync(join(DATA, 'ATRIBUCION.md'), join(OUT, 'ATRIBUCION.md'));
writeFileSync(
  join(DATA, 'reporte.md'),
  generarReporte({
    fecha: ahora.slice(0, 10),
    fuentes: resumenFuentes,
    descartes,
    sinNombre,
    productos,
    taxonomia,
    plantillas: plantillas.length,
  }),
);
console.error(
  `✓ ${productos.length} productos, ${plantillas.length} plantillas → data/out/seed.sqlite (reporte en data/reporte.md)`,
);
