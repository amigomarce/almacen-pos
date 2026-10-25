import { describe, expect, it } from 'vitest';
import { parsearCsv } from './csv.js';

describe('parsearCsv', () => {
  it('lee encabezado, comillas y salta comentarios', () => {
    const csv = '# nota\nmarca,nota\n"Cuisine & Co","dice ""hola"", chao"\n\nWatt\'s,\n';
    expect(parsearCsv(csv)).toEqual([
      { marca: 'Cuisine & Co', nota: 'dice "hola", chao' },
      { marca: "Watt's", nota: '' },
    ]);
  });
  it('archivo vacío → sin filas', () => {
    expect(parsearCsv('')).toEqual([]);
  });
});
