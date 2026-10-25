import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MapeoCategorias, cargarTaxonomia } from './categorias.js';
import { construirSemilla } from './construir.js';
import { cargarCurado, cargarPlantillas } from './curado.js';
import { COLUMNAS_EXPORT, leerFila, type Candidato } from './lector.js';
import { generarReporte } from './reporte.js';
import { VERSION_ESQUEMA, escribirSemilla } from './sqlite.js';
import { abrirArchivo, leerTsv } from './tsv.js';

const DATA = join(import.meta.dirname, '..');
const leer = (f: string) => readFileSync(join(DATA, f), 'utf8');
const taxonomia = cargarTaxonomia(leer('categorias.csv'));
const mapeo = new MapeoCategorias(
  leer('mapeo_categorias.csv'),
  taxonomia,
  leer('mapeo_palabras.csv'),
);

async function candidatosFixture(): Promise<Candidato[]> {
  const out: Candidato[] = [];
  const archivo = join(DATA, 'fixtures', 'export-mini.tsv');
  for await (const f of leerTsv(abrirArchivo(archivo), COLUMNAS_EXPORT)) {
    const r = leerFila(f, 'off');
    if (r.ok) out.push(r.candidato);
  }
  return out;
}

const curadoCsv = `barcode,nombre,marca,cantidad,categoria_slug,verificado_por,fecha_verificacion
7802930000548,Quesillo de cabra,Quillayes,150 g,quesos,test,2026-10-25`;

describe('construirSemilla', () => {
  it('arma productos listos para la caja desde el export de prueba', async () => {
    const { productos, sinNombre } = construirSemilla(await candidatosFixture(), mapeo, ['Colún']);
    expect(sinNombre).toBe(0);
    const porCodigo = new Map(productos.map((p) => [p.barcode, p]));
    expect(porCodigo.get('7802930000548')).toMatchObject({
      name: 'Quillayes Quesillo Sano y Natural 150 g',
      brand: 'Quillayes',
      productName: 'Quesillo Sano y Natural',
      quantityText: '150 g',
      netUnit: 'G',
      netQty: 150,
      categorySlug: 'quesos',
      categoryVia: 'ETIQUETA',
      origin: 'TAG_CHILE',
      qualityScore: 100,
      updatedAt: new Date(1787000000 * 1000).toISOString(),
    });
    expect(porCodigo.get('7800120455062')).toMatchObject({
      name: 'Harina multicereal 1 kg',
      brand: null,
      categorySlug: 'harinas',
      categoryVia: 'PALABRA',
      origin: 'PREFIJO_780',
      qualityScore: 30, // (30 nombre + 20 formato + 10 categoría adivinada) / 2
    });
    expect(porCodigo.get('0021000026326')?.categorySlug).toBe('salsas');
  });

  it('la lista curada manda sobre OFF y vale 100', async () => {
    const curado = cargarCurado(curadoCsv, taxonomia);
    const { productos } = construirSemilla([...(await candidatosFixture()), ...curado], mapeo, []);
    expect(productos.find((p) => p.barcode === '7802930000548')).toMatchObject({
      name: 'Quillayes Quesillo de cabra 150 g',
      categoryVia: 'CURADO',
      origin: 'CURADO',
      qualityScore: 100,
      sources: ['curado', 'off'],
    });
  });

  it('descarta los códigos sin nombre en ninguna fuente', () => {
    const sinNombre: Candidato = {
      barcode: '7802930000548',
      fuente: 'off',
      origen: 'TAG_CHILE',
      nombre: '',
      marca: 'X',
      cantidad: '',
      categoriasTags: [],
      imagen: '',
      modificado: null,
    };
    expect(construirSemilla([sinNombre], mapeo, [])).toEqual({ productos: [], sinNombre: 1 });
  });
});

describe('escribirSemilla + generarReporte', () => {
  it('escribe una semilla que se puede consultar por código', async () => {
    const { productos, sinNombre } = construirSemilla(await candidatosFixture(), mapeo, []);
    const plantillas = cargarPlantillas(leer('curado/plantillas_sin_codigo.csv'), taxonomia);
    const ruta = join(mkdtempSync(join(tmpdir(), 'semilla-')), 'seed.sqlite');
    escribirSemilla(ruta, { productos, taxonomia, plantillas, meta: { license: 'ODbL-1.0' } });

    const db = new Database(ruta, { readonly: true });
    const p = db
      .prepare('SELECT name, net_qty, category_slug, sources FROM seed_products WHERE barcode = ?')
      .get('7802930000548');
    expect(p).toEqual({
      name: 'Quillayes Quesillo Sano y Natural 150 g',
      net_qty: 150,
      category_slug: 'quesos',
      sources: 'off',
    });
    const meta = Object.fromEntries(
      (
        db.prepare('SELECT key, value FROM seed_meta').all() as { key: string; value: string }[]
      ).map((r) => [r.key, r.value]),
    );
    expect(meta).toEqual({ license: 'ODbL-1.0', schema_version: String(VERSION_ESQUEMA) });
    expect(db.prepare('SELECT count(*) AS n FROM seed_templates').get()).toEqual({
      n: plantillas.length,
    });
    expect(
      db.prepare("SELECT parent_slug FROM seed_categories WHERE slug = 'quesos'").get(),
    ).toEqual({ parent_slug: 'fiambreria-quesos' });
    db.close();

    const md = generarReporte({
      fecha: '2026-10-25',
      fuentes: [{ nombre: 'Open Food Facts', filas: 8, candidatos: 4, exportDel: '2026-10-25' }],
      descartes: { EAN_BALANZA: 1, EAN_DIGITO: 1, EAN_FORMATO: 1 },
      sinNombre,
      productos,
      taxonomia,
      plantillas: plantillas.length,
    });
    expect(md).toContain('## Productos en la semilla: 4');
    expect(md).toContain('| Solo prefijo 780 (score a la mitad) | 1 | 25,0 % |');
    expect(md).toContain('| Fiambrería y quesos | 1 | 25,0 % |');
  });
});
