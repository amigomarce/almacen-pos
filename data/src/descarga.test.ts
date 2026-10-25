import { describe, expect, it } from 'vitest';
import { barraProgreso } from './descarga.js';

describe('barraProgreso', () => {
  it('dibuja la fracción descargada', () => {
    expect(barraProgreso(500e6, 1000e6, 10)).toBe('[#####-----]  50 %  500 / 1000 MB');
  });
  it('no pasa de 100 % ni falla con total 0', () => {
    expect(barraProgreso(2e6, 1e6, 4)).toBe('[####] 100 %  2 / 1 MB');
    expect(barraProgreso(5, 0, 4)).toBe('[----]   0 %  0 / 0 MB');
  });
});
