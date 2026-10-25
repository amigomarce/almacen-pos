import { describe, expect, it } from 'vitest';
import { Documento, dosColumnas, envolver } from './documento.js';

describe('envolver', () => {
  it('corta en espacios', () => {
    expect(envolver('Galletas de vino con chips', 12)).toEqual([
      'Galletas de',
      'vino con',
      'chips',
    ]);
  });
  it('corta palabras más largas que la línea', () => {
    expect(envolver('ab Supercalifragilístico x', 6)).toEqual([
      'ab',
      'Superc',
      'alifra',
      'gilíst',
      'ico x',
    ]);
  });
  it('texto vacío da una línea vacía', () => {
    expect(envolver('   ', 10)).toEqual(['']);
  });
  it('rechaza ancho inválido', () => {
    expect(() => envolver('x', 0)).toThrow(RangeError);
  });
});

describe('dosColumnas', () => {
  it('rellena con espacios hasta el ancho', () => {
    expect(dosColumnas('Vuelto', '$1.970', 20)).toEqual(['Vuelto        $1.970']);
  });
  it('si no cabe, la derecha va al final de la última línea', () => {
    expect(dosColumnas('Galletas de vino con chips', '$890', 16)).toEqual([
      'Galletas de vino',
      'con chips   $890',
    ]);
  });
  it('si aun así no cabe, la derecha baja sola', () => {
    expect(dosColumnas('Pagado con Transferencia', '$1.000.000', 16)).toEqual([
      'Pagado con',
      'Transferencia',
      '      $1.000.000',
    ]);
  });
});

describe('Documento', () => {
  it('valida las columnas', () => {
    expect(() => new Documento(10)).toThrow(RangeError);
    expect(() => new Documento(32.5)).toThrow(RangeError);
    expect(new Documento(32).ancho(true)).toBe(16);
  });
});
