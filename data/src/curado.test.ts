import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cargarTaxonomia } from './categorias.js';
import { cargarCurado, cargarPlantillas } from './curado.js';

const DATA = join(import.meta.dirname, '..');
const tax = cargarTaxonomia(readFileSync(join(DATA, 'categorias.csv'), 'utf8'));

const ENC = 'barcode,nombre,marca,cantidad,categoria_slug,verificado_por,fecha_verificacion,nota';
const fila = (p: Partial<Record<string, string>> = {}) => {
  const f = {
    barcode: '7802930000548',
    nombre: 'Quesillo',
    marca: 'Quillayes',
    cantidad: '150 g',
    categoria_slug: 'quesos',
    verificado_por: 'Marcelo',
    fecha_verificacion: '2026-10-25',
    nota: '',
    ...p,
  };
  return `${ENC}\n${Object.values(f).join(',')}`;
};

describe('cargarCurado', () => {
  it('acepta una fila verificada y la marca como CURADO', () => {
    expect(cargarCurado(fila(), tax)).toEqual([
      expect.objectContaining({
        barcode: '7802930000548',
        fuente: 'curado',
        origen: 'CURADO',
        categoriaSlug: 'quesos',
      }),
    ]);
  });

  it.each([
    [{ barcode: '7802930000541' }, 'código de barras inválido'],
    [{ barcode: '2000000000015' }, 'código de balanza'],
    [{ verificado_por: '' }, 'falta verificado_por'],
    [{ fecha_verificacion: '25-10-2026' }, 'AAAA-MM-DD'],
    [{ categoria_slug: 'nada' }, 'categoría desconocida'],
    [{ nombre: '' }, 'falta el nombre'],
  ])('rechaza %o', (cambio, error) => {
    expect(() => cargarCurado(fila(cambio), tax)).toThrow(error);
  });

  it('rechaza códigos repetidos (también UPC-A = EAN-13)', () => {
    const csv = `${fila({ barcode: '021000026326' })}\n${fila({ barcode: '0021000026326' }).split('\n')[1] ?? ''}`;
    expect(() => cargarCurado(csv, tax)).toThrow('código repetido');
  });

  it('el archivo real del repo es válido', () => {
    expect(() =>
      cargarCurado(readFileSync(join(DATA, 'curado', 'productos.csv'), 'utf8'), tax),
    ).not.toThrow();
  });
});

describe('cargarPlantillas', () => {
  it('el archivo real del repo es válido y no trae códigos', () => {
    const ps = cargarPlantillas(
      readFileSync(join(DATA, 'curado', 'plantillas_sin_codigo.csv'), 'utf8'),
      tax,
    );
    expect(ps.length).toBeGreaterThan(10);
    expect(ps).toContainEqual({
      nombre: 'Pan marraqueta',
      categoriaSlug: 'panaderia',
      unidad: 'KG',
      nota: '',
    });
  });

  it.each([
    ['nombre,categoria_slug,unidad,barcode\nPan,panaderia,KG,', 'columna de código'],
    ['nombre,categoria_slug,unidad,nota\nPan,panaderia,KG,7802930000548', 'código de barras'],
    ['nombre,categoria_slug,unidad\nPan,panaderia,LT', 'unidad debe ser'],
    ['nombre,categoria_slug,unidad\nPan,nada,KG', 'categoría desconocida'],
    ['nombre,categoria_slug,unidad\nPan,panaderia,KG\npan,panaderia,KG', 'repetido'],
    ['nombre,categoria_slug,unidad\n,panaderia,KG', 'sin nombre'],
  ])('rechaza %j', (csv, error) => {
    expect(() => cargarPlantillas(csv, tax)).toThrow(error);
  });
});
