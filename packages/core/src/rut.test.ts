import { describe, expect, it } from 'vitest';
import { calcularDvRut, formatearRut, parsearRut, validarRut } from './rut.js';

describe('calcularDvRut', () => {
  it.each([
    [12345678, '5'],
    [11111111, '1'],
    [96874030, 'K'],
    [10000013, 'K'],
    [10000004, '0'],
    [1, '9'],
  ])('%i → %s', (cuerpo, dv) => {
    expect(calcularDvRut(cuerpo)).toBe(dv);
  });

  it('rechaza cuerpos inválidos', () => {
    expect(() => calcularDvRut(0)).toThrow(RangeError);
    expect(() => calcularDvRut(-5)).toThrow(RangeError);
    expect(() => calcularDvRut(1.5)).toThrow(RangeError);
  });
});

describe('parsearRut / validarRut', () => {
  it.each([
    '12.345.678-5',
    '12345678-5',
    '123456785',
    ' 12.345.678-5 ',
    '96.874.030-K',
    '96874030-k',
    '96874030k',
    '1-9',
    '10.000.004-0',
    '12345678 - 5',
  ])('"%s" es válido', (texto) => {
    expect(validarRut(texto)).toBe(true);
  });

  it.each([
    '',
    '12.345.678-4',
    '96874030-0',
    '12.345.678',
    'abc',
    '0-0',
    '00000000-0',
    '1234.5678-5',
    '12.34.5678-5',
    '12.345.678-X',
    '1234567890-1',
    'K',
    '-5',
  ])('"%s" es inválido', (texto) => {
    expect(validarRut(texto)).toBe(false);
  });

  it('devuelve cuerpo y dv', () => {
    expect(parsearRut('96.874.030-k')).toEqual({ cuerpo: 96874030, dv: 'K' });
  });
});

describe('formatearRut', () => {
  it.each([
    ['123456785', '12.345.678-5'],
    ['96874030k', '96.874.030-K'],
    ['1-9', '1-9'],
    ['10000004-0', '10.000.004-0'],
  ])('%s → %s', (entrada, esperado) => {
    expect(formatearRut(entrada)).toBe(esperado);
  });

  it('devuelve null si es inválido', () => {
    expect(formatearRut('12345678-4')).toBeNull();
  });
});
