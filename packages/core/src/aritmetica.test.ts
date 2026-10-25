import { describe, expect, it } from 'vitest';
import { dividirRedondeado, multiplicarSeguro } from './aritmetica.js';
import { ErrorDominio } from './errores.js';

describe('dividirRedondeado', () => {
  it.each([
    [10, 2, 5],
    [5, 2, 3],
    [7, 3, 2],
    [8, 3, 3],
    [1, 3, 0],
    [0, 7, 0],
    [-5, 2, -3],
    [5, -2, -3],
    [-7, -3, 2],
    [129000, 119, 1084], // 1084,03…
    [129000 + 59, 119, 1085], // mitad exacta sube
  ])('%i / %i = %i', (a, b, esperado) => {
    expect(dividirRedondeado(a, b)).toBe(esperado);
  });

  it('rechaza división por cero', () => {
    expect(() => dividirRedondeado(1, 0)).toThrow(ErrorDominio);
  });

  it('rechaza no enteros', () => {
    expect(() => dividirRedondeado(1.5, 1)).toThrow(/entero/);
    expect(() => dividirRedondeado(1, Number.NaN)).toThrow(/entero/);
  });
});

describe('multiplicarSeguro', () => {
  it('multiplica', () => {
    expect(multiplicarSeguro(1250, 4990)).toBe(6237500);
  });
  it('detecta desborde', () => {
    expect(() => multiplicarSeguro(Number.MAX_SAFE_INTEGER, 2)).toThrow(/rango seguro/);
  });
});
