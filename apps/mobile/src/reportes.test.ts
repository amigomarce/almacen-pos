import { describe, expect, it } from 'vitest';
import { anchosBarras, diasTexto, fechaCorta, horasConVentas, horaTexto } from './reportes.js';

describe('ayudas de reportes', () => {
  it('anchos de barra relativos al máximo, con un mínimo visible', () => {
    expect(anchosBarras([0, 50, 100, 1])).toEqual([0, 50, 100, 2]);
    expect(anchosBarras([])).toEqual([]);
    expect(anchosBarras([0, 0])).toEqual([0, 0]);
    expect(anchosBarras([-10, 10])).toEqual([0, 100]);
  });

  it('solo horas con ventas', () => {
    expect(
      horasConVentas([
        { hora: 9, cantidad: 0, montoClp: 0 },
        { hora: 10, cantidad: 2, montoClp: 1500 },
      ]),
    ).toEqual([{ hora: 10, cantidad: 2, montoClp: 1500 }]);
  });

  it('textos cortos', () => {
    expect(fechaCorta('2026-10-29')).toBe('29/10');
    expect(horaTexto(9)).toBe('09:00');
    expect(horaTexto(20)).toBe('20:00');
    expect(diasTexto(3.5)).toBe('3,5');
    expect(diasTexto(12)).toBe('12');
    expect(diasTexto(0.04)).toBe('0');
  });
});
