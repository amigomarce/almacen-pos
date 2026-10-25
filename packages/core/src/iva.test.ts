import { describe, expect, it } from 'vitest';
import { ErrorDominio } from './errores.js';
import { calcularTotalesDocumento, desglosarIva, TASA_IVA_PORCENTAJE } from './iva.js';

describe('desglosarIva', () => {
  it('tasa por defecto 19 %', () => {
    expect(TASA_IVA_PORCENTAJE).toBe(19);
  });

  it.each([
    [0, 0, 0],
    [1, 1, 0],
    [5, 4, 1],
    [10, 8, 2],
    [100, 84, 16],
    [990, 832, 158],
    [1190, 1000, 190],
    [1290, 1084, 206],
    [4990, 4193, 797],
    [9999, 8403, 1596],
    [123456, 103745, 19711],
  ])('$%i → neto %i + IVA %i', (total, neto, iva) => {
    expect(desglosarIva(total)).toEqual({ neto, iva, total });
  });

  it('redondeo half-up en el límite: 72 → 60,504… → 61', () => {
    expect(desglosarIva(72).neto).toBe(61);
  });

  it('propiedad: neto + iva = total y el IVA cuadra con neto × 19 % (±$1)', () => {
    for (let total = 0; total <= 50_000; total++) {
      const { neto, iva } = desglosarIva(total);
      expect(neto + iva).toBe(total);
      expect(Math.abs(iva - Math.round(neto * 0.19))).toBeLessThanOrEqual(1);
    }
  });

  it('acepta otra tasa (exento = 0 %)', () => {
    expect(desglosarIva(1000, 0)).toEqual({ neto: 1000, iva: 0, total: 1000 });
    expect(desglosarIva(1100, 10)).toEqual({ neto: 1000, iva: 100, total: 1100 });
  });

  it('rechaza entradas inválidas', () => {
    expect(() => desglosarIva(-1)).toThrow(ErrorDominio);
    expect(() => desglosarIva(10.5)).toThrow(ErrorDominio);
    expect(() => desglosarIva(100, -1)).toThrow(/Tasa/);
    expect(() => desglosarIva(100, 19.5)).toThrow(/Tasa/);
    expect(() => desglosarIva(100, 101)).toThrow(/Tasa/);
  });
});

describe('calcularTotalesDocumento', () => {
  it('desglosa sobre el total del documento, no por línea', () => {
    // Por línea: 3 × desglosarIva(10) daría neto 24; sobre el total (30) da 25.
    const t = calcularTotalesDocumento([
      { tipoImpuesto: 'AFECTO', montoClp: 10 },
      { tipoImpuesto: 'AFECTO', montoClp: 10 },
      { tipoImpuesto: 'AFECTO', montoClp: 10 },
    ]);
    expect(t).toEqual({
      afectoClp: 30,
      netoClp: 25,
      ivaClp: 5,
      exentoClp: 0,
      totalClp: 30,
      tasaIva: 19,
    });
  });

  it('separa lo exento', () => {
    const t = calcularTotalesDocumento([
      { tipoImpuesto: 'AFECTO', montoClp: 1190 },
      { tipoImpuesto: 'EXENTO', montoClp: 500 },
    ]);
    expect(t).toMatchObject({ afectoClp: 1190, netoClp: 1000, ivaClp: 190, exentoClp: 500 });
    expect(t.totalClp).toBe(t.netoClp + t.ivaClp + t.exentoClp);
  });

  it('solo exento', () => {
    expect(calcularTotalesDocumento([{ tipoImpuesto: 'EXENTO', montoClp: 700 }])).toMatchObject({
      netoClp: 0,
      ivaClp: 0,
      exentoClp: 700,
      totalClp: 700,
    });
  });

  it('documento vacío', () => {
    expect(calcularTotalesDocumento([]).totalClp).toBe(0);
  });

  it('rechaza montos negativos o no enteros', () => {
    expect(() => calcularTotalesDocumento([{ tipoImpuesto: 'AFECTO', montoClp: -1 }])).toThrow(
      /negativo/,
    );
    expect(() => calcularTotalesDocumento([{ tipoImpuesto: 'EXENTO', montoClp: 1.5 }])).toThrow(
      /entero/,
    );
  });
});
