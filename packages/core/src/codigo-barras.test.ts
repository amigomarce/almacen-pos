import { describe, expect, it } from 'vitest';
import {
  calcularDigitoGtin,
  esCodigoDeBalanza,
  normalizarCodigoBarras,
  validarCodigoBarras,
} from './codigo-barras.js';

describe('calcularDigitoGtin', () => {
  it.each([
    ['400638133393', 1], // EAN-13 de ejemplo GS1
    ['7351353', 7], // EAN-8
    ['03600029145', 2], // UPC-A
    ['780000000000', 9],
  ])('%s → %i', (digitos, dv) => {
    expect(calcularDigitoGtin(digitos)).toBe(dv);
  });

  it('rechaza no dígitos', () => {
    expect(() => calcularDigitoGtin('12a')).toThrow(RangeError);
    expect(() => calcularDigitoGtin('')).toThrow(RangeError);
  });
});

describe('validarCodigoBarras', () => {
  it.each([
    ['4006381333931', 'EAN13'],
    ['7800000000009', 'EAN13'],
    ['73513537', 'EAN8'],
    ['036000291452', 'UPCA'],
    [' 4006381333931\n', 'EAN13'],
  ])('%s es %s', (codigo, tipo) => {
    expect(validarCodigoBarras(codigo)).toEqual({ valido: true, tipo, codigo: codigo.trim() });
  });

  it.each(['4006381333932', '73513538', '036000291453'])('%s tiene mal el verificador', (c) => {
    expect(validarCodigoBarras(c)).toEqual({ valido: false, motivo: 'DIGITO_VERIFICADOR' });
  });

  it.each(['', '123', '40063813339310', 'ABCDEFGHIJKLM', '4006-38133393', '1234567'])(
    '"%s" tiene formato inválido',
    (c) => {
      expect(validarCodigoBarras(c)).toEqual({ valido: false, motivo: 'FORMATO' });
    },
  );
});

describe('normalizarCodigoBarras', () => {
  it('UPC-A pasa a EAN-13', () => {
    expect(normalizarCodigoBarras('036000291452')).toBe('0036000291452');
  });
  it('EAN-13 y EAN-8 quedan igual', () => {
    expect(normalizarCodigoBarras('4006381333931')).toBe('4006381333931');
    expect(normalizarCodigoBarras('73513537')).toBe('73513537');
  });
  it('inválido → null', () => {
    expect(normalizarCodigoBarras('123')).toBeNull();
  });
});

describe('esCodigoDeBalanza', () => {
  it.each([
    ['2000123012502', true],
    ['2912345678901', true],
    ['7800000000009', false],
    ['200012301250', false],
    ['20001230125021', false],
  ])('%s → %s', (c, esperado) => {
    expect(esCodigoDeBalanza(c)).toBe(esperado);
  });
});
