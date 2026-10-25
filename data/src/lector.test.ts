import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { COLUMNAS_EXPORT, leerFila, type Candidato, type ResultadoLectura } from './lector.js';
import { abrirArchivo, leerTsv } from './tsv.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'export-mini.tsv');

async function leerFixture(): Promise<ResultadoLectura[]> {
  const out: ResultadoLectura[] = [];
  for await (const fila of leerTsv(abrirArchivo(FIXTURE), COLUMNAS_EXPORT)) {
    out.push(leerFila(fila, 'off'));
  }
  return out;
}

const candidatos = (rs: ResultadoLectura[]): Candidato[] =>
  rs.flatMap((r) => (r.ok ? [r.candidato] : []));

describe('leerFila sobre un export de prueba', () => {
  it('descarta lo que no sirve y dice por qué', async () => {
    const rs = await leerFixture();
    expect(rs).toHaveLength(8);
    expect(rs.flatMap((r) => (r.ok ? [] : [r.motivo]))).toEqual([
      'FUERA_DE_CHILE',
      'EAN_BALANZA',
      'EAN_DIGITO',
      'EAN_FORMATO',
    ]);
  });

  it('marca el origen: etiqueta Chile o solo prefijo 780', async () => {
    const cs = candidatos(await leerFixture());
    expect(cs.map((c) => [c.barcode, c.origen])).toEqual([
      ['7802930000548', 'TAG_CHILE'],
      ['7800120455062', 'PREFIJO_780'],
      ['0021000026326', 'TAG_CHILE'], // UPC-A pasa a EAN-13 canónico
      ['7613287784308', 'TAG_CHILE'],
    ]);
  });

  it('limpia espacios, toma la primera marca y usa generic_name si falta el nombre', async () => {
    const cs = candidatos(await leerFixture());
    expect(cs[0]).toMatchObject({
      nombre: 'Quesillo Sano y Natural',
      marca: 'Quillayes',
      cantidad: '150g',
      categoriasTags: ['en:quesos'],
      imagen: 'https://img/1.jpg',
      modificado: 1787000000,
      fuente: 'off',
    });
    expect(cs[3]).toMatchObject({ nombre: 'Cereal de maíz', marca: 'Nestlé', modificado: null });
  });
});

describe('leerTsv', () => {
  it('falla si el export no trae una columna esperada', async () => {
    const gen = leerTsv(abrirArchivo(FIXTURE), ['code', 'no_existe']);
    await expect(gen.next()).rejects.toThrow('no_existe');
  });
});
