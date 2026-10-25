import { describe, expect, it } from 'vitest';
import { calcularCobro, calcularVuelto, MEDIOS_PAGO, redondearEfectivo } from './pago.js';

describe('redondearEfectivo (Ley 20.956)', () => {
  it.each([
    [0, 0, 0],
    [1290, 1290, 0],
    [1291, 1290, -1],
    [1294, 1290, -4],
    [1295, 1290, -5], // el 5 baja
    [1296, 1300, 4],
    [1299, 1300, 1],
    [1, 0, -1],
    [5, 0, -5],
    [6, 10, 4],
    [9995, 9990, -5],
    [9996, 10000, 4],
  ])('$%i → $%i (ajuste %i)', (total, cobrar, ajuste) => {
    expect(redondearEfectivo(total)).toEqual({ totalACobrarClp: cobrar, ajusteClp: ajuste });
  });

  it('el ajuste nunca supera $5', () => {
    for (let t = 0; t < 1000; t++) {
      const r = redondearEfectivo(t);
      expect(Math.abs(r.ajusteClp)).toBeLessThanOrEqual(5);
      expect(r.totalACobrarClp % 10).toBe(0);
    }
  });

  it('rechaza negativos y no enteros', () => {
    expect(() => redondearEfectivo(-5)).toThrow(/negativo/);
    expect(() => redondearEfectivo(10.5)).toThrow(/entero/);
  });
});

describe('calcularCobro', () => {
  it('efectivo redondea pero NO cambia el total del documento', () => {
    expect(calcularCobro(1293, 'EFECTIVO')).toEqual({
      totalClp: 1293,
      redondeoClp: -3,
      totalACobrarClp: 1290,
    });
  });

  it.each(MEDIOS_PAGO.filter((m) => m !== 'EFECTIVO'))('%s no redondea', (medio) => {
    expect(calcularCobro(1293, medio)).toEqual({
      totalClp: 1293,
      redondeoClp: 0,
      totalACobrarClp: 1293,
    });
  });

  it('se puede desactivar el redondeo', () => {
    expect(calcularCobro(1297, 'EFECTIVO', false).totalACobrarClp).toBe(1297);
  });

  it('rechaza totales inválidos sin redondeo', () => {
    expect(() => calcularCobro(-1, 'DEBITO')).toThrow(/negativo/);
    expect(() => calcularCobro(1.5, 'DEBITO')).toThrow(/entero/);
  });
});

describe('calcularVuelto', () => {
  it.each([
    [1290, 2000, 710],
    [1290, 1290, 0],
    [0, 0, 0],
  ])('cobrar %i, paga %i → vuelto %i', (cobrar, pagado, vuelto) => {
    expect(calcularVuelto(cobrar, pagado)).toBe(vuelto);
  });

  it('pago insuficiente', () => {
    expect(() => calcularVuelto(1290, 1000)).toThrow(/menor/);
  });

  it('rechaza no enteros', () => {
    expect(() => calcularVuelto(10, 10.5)).toThrow(/entero/);
    expect(() => calcularVuelto(10.5, 20)).toThrow(/entero/);
  });
});
