import { describe, expect, it } from 'vitest';
import { formatearClp, parsearClp } from './dinero.js';

describe('formatearClp', () => {
  it.each([
    [0, '$0'],
    [5, '$5'],
    [990, '$990'],
    [1290, '$1.290'],
    [10000, '$10.000'],
    [1234567, '$1.234.567'],
    [-500, '-$500'],
    [-1500000, '-$1.500.000'],
  ])('%i → %s', (monto, esperado) => {
    expect(formatearClp(monto)).toBe(esperado);
  });

  it('rechaza decimales y valores no seguros', () => {
    expect(() => formatearClp(10.5)).toThrow();
    expect(() => formatearClp(Number.NaN)).toThrow();
    expect(() => formatearClp(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe('parsearClp', () => {
  it.each([
    ['$1.290', 1290],
    ['1.290', 1290],
    ['1290', 1290],
    ['  $ 1.290  ', 1290],
    ['$0', 0],
    ['-$500', -500],
    ['-500', -500],
    ['-0', 0],
    ['1.000.000', 1000000],
    ['007', 7],
  ])('"%s" → %i', (texto, esperado) => {
    expect(parsearClp(texto)).toBe(esperado);
  });

  it.each([
    '',
    'abc',
    '$',
    '1,5',
    '12.34',
    '1.2.3',
    '1.2345',
    '.290',
    '1.290,00',
    '$1.290$',
    '--5',
  ])('"%s" es inválido', (texto) => {
    expect(parsearClp(texto)).toBeNull();
  });

  it('rechaza montos fuera del rango seguro', () => {
    expect(parsearClp('99999999999999999')).toBeNull();
  });

  it('ida y vuelta', () => {
    for (const n of [0, 1, 999, 1000, 1290, 99999, 123456789]) {
      expect(parsearClp(formatearClp(n))).toBe(n);
    }
  });
});
