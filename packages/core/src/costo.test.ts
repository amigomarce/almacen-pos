import { describe, expect, it } from 'vitest';
import { costoPromedio, margenPorcentaje } from './costo.js';

describe('costoPromedio', () => {
  it('pondera por cantidad', () => {
    // 10 a $1.000 + 30 a $1.200 = $1.150
    expect(costoPromedio(10_000, 1000, 30_000, 1200)).toBe(1150);
  });

  it('redondea half-up a peso entero', () => {
    // (1×100 + 2×101) / 3 = 100,67 → 101
    expect(costoPromedio(1000, 100, 2000, 101)).toBe(101);
    // (1×100 + 1×101) / 2 = 100,5 → 101
    expect(costoPromedio(1000, 100, 1000, 101)).toBe(101);
  });

  it('sin costo previo o sin stock positivo, toma el costo nuevo', () => {
    expect(costoPromedio(5000, null, 1000, 900)).toBe(900);
    expect(costoPromedio(0, 500, 1000, 900)).toBe(900);
    expect(costoPromedio(-2000, 500, 1000, 900)).toBe(900);
  });

  it('funciona con kg (milésimas)', () => {
    // 2,5 kg a $3.000/kg + 1,5 kg a $3.400/kg = 4 kg a $3.150/kg
    expect(costoPromedio(2500, 3000, 1500, 3400)).toBe(3150);
  });

  it.each([
    [() => costoPromedio(1000, 100, 0, 100), 'CANTIDAD_INVALIDA'],
    [() => costoPromedio(1000, 100, 1000, -1), 'COSTO_NEGATIVO'],
    [() => costoPromedio(1000, 1.5, 1000, 100), 'NO_ENTERO'],
    [() => costoPromedio(1000.5, 100, 1000, 100), 'NO_ENTERO'],
  ])('rechaza datos inválidos (%#)', (fn, codigo) => {
    expect(fn).toThrow(expect.objectContaining({ codigo }) as Error);
  });
});

describe('margenPorcentaje', () => {
  it('calcula el margen sobre el precio', () => {
    expect(margenPorcentaje(1000, 700)).toBe(30);
    expect(margenPorcentaje(1890, 1350)).toBe(29); // 28,57 → 29
    expect(margenPorcentaje(1000, 1200)).toBe(-20);
  });

  it('sin costo o precio 0 no hay margen', () => {
    expect(margenPorcentaje(1000, null)).toBeNull();
    expect(margenPorcentaje(0, 100)).toBeNull();
  });
});
