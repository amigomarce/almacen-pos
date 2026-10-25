import { describe, expect, it } from 'vitest';
import { formatearCantidad, parsearCantidad } from './cantidad.js';
import { ErrorDominio } from './errores.js';

describe('formatearCantidad', () => {
  it.each([
    [3000, 'UN', '3'],
    [1000, 'UN', '1'],
    [1500, 'UN', '1,5'],
    [1250, 'KG', '1,250 kg'],
    [50, 'KG', '0,050 kg'],
    [2000, 'KG', '2,000 kg'],
    [-1250, 'KG', '-1,250 kg'],
    [-2000, 'UN', '-2'],
  ] as const)('%i %s → %s', (milli, unidad, esperado) => {
    expect(formatearCantidad(milli, unidad)).toBe(esperado);
  });

  it('rechaza cantidades no enteras', () => {
    expect(() => formatearCantidad(1.5, 'UN')).toThrow(ErrorDominio);
  });
});

describe('parsearCantidad', () => {
  it.each([
    ['3', 'UN', 3000],
    [' 12 ', 'UN', 12000],
    ['1,25', 'KG', 1250],
    ['1.25', 'KG', 1250],
    ['0,5', 'KG', 500],
    ['0,050', 'KG', 50],
    ['2', 'KG', 2000],
    ['1,250 kg', 'KG', 1250],
  ] as const)('"%s" %s → %i', (texto, unidad, esperado) => {
    expect(parsearCantidad(texto, unidad)).toBe(esperado);
  });

  it.each([
    ['1,5', 'UN'],
    ['0', 'UN'],
    ['0,000', 'KG'],
    ['', 'KG'],
    ['abc', 'KG'],
    ['1,2345', 'KG'],
    ['-1', 'UN'],
    ['1.000.000', 'UN'],
  ] as const)('"%s" %s → null', (texto, unidad) => {
    expect(parsearCantidad(texto, unidad)).toBeNull();
  });
});
