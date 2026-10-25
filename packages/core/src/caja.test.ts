import { describe, expect, it } from 'vitest';
import { cuadrarCaja, diferenciaCaja, type VentaParaCuadratura } from './caja.js';
import { ErrorDominio } from './errores.js';

const venta = (v: Partial<VentaParaCuadratura>): VentaParaCuadratura => ({
  medioPago: 'EFECTIVO',
  totalClp: 1000,
  redondeoClp: 0,
  anulada: false,
  ...v,
});

describe('cuadrarCaja', () => {
  it('sin ventas: el esperado es el efectivo inicial', () => {
    const c = cuadrarCaja(20000, []);
    expect(c.efectivoEsperadoClp).toBe(20000);
    expect(c.cantidadVentas).toBe(0);
    expect(c.totalCobradoClp).toBe(0);
    expect(c.porMedio.DEBITO).toEqual({ cantidad: 0, cobradoClp: 0 });
  });

  it('suma por medio de pago, con el redondeo solo en efectivo', () => {
    const c = cuadrarCaja(10000, [
      venta({ totalClp: 1293, redondeoClp: -3 }), // cobrado $1.290
      venta({ totalClp: 2497, redondeoClp: 3 }), // cobrado $2.500
      venta({ medioPago: 'DEBITO', totalClp: 5990 }),
      venta({ medioPago: 'CREDITO', totalClp: 12000 }),
      venta({ medioPago: 'TRANSFERENCIA', totalClp: 3500 }),
      venta({ medioPago: 'DEBITO', totalClp: 1000 }),
    ]);
    expect(c.porMedio).toEqual({
      EFECTIVO: { cantidad: 2, cobradoClp: 3790 },
      DEBITO: { cantidad: 2, cobradoClp: 6990 },
      CREDITO: { cantidad: 1, cobradoClp: 12000 },
      TRANSFERENCIA: { cantidad: 1, cobradoClp: 3500 },
    });
    expect(c.cantidadVentas).toBe(6);
    expect(c.totalVentasClp).toBe(1293 + 2497 + 5990 + 12000 + 3500 + 1000);
    expect(c.redondeoClp).toBe(0);
    expect(c.totalCobradoClp).toBe(3790 + 6990 + 12000 + 3500);
    expect(c.efectivoEsperadoClp).toBe(13790);
  });

  it('las anuladas no suman pero se informan', () => {
    const c = cuadrarCaja(0, [
      venta({ totalClp: 1000 }),
      venta({ totalClp: 4999, redondeoClp: 1, anulada: true }),
      venta({ medioPago: 'DEBITO', totalClp: 700, anulada: true }),
    ]);
    expect(c.cantidadVentas).toBe(1);
    expect(c.efectivoEsperadoClp).toBe(1000);
    expect(c.anuladas).toEqual({ cantidad: 2, totalClp: 5699 });
  });

  it('el redondeo acumulado puede ser negativo', () => {
    const c = cuadrarCaja(0, [venta({ totalClp: 1005, redondeoClp: -5 })]);
    expect(c.redondeoClp).toBe(-5);
    expect(c.totalCobradoClp).toBe(1000);
  });

  it.each([
    [() => cuadrarCaja(-1, []), 'MONTO_NEGATIVO'],
    [() => cuadrarCaja(1.5, []), 'NO_ENTERO'],
    [() => cuadrarCaja(0, [venta({ totalClp: 10.5 })]), 'NO_ENTERO'],
    [() => cuadrarCaja(0, [venta({ redondeoClp: 0.5 })]), 'NO_ENTERO'],
    [() => cuadrarCaja(0, [venta({ medioPago: 'DEBITO', redondeoClp: 2 })]), 'REDONDEO_INVALIDO'],
  ])('rechaza datos inválidos (%#)', (fn, codigo) => {
    expect(fn).toThrow(ErrorDominio);
    try {
      fn();
    } catch (e) {
      expect((e as ErrorDominio).codigo).toBe(codigo);
    }
  });
});

describe('diferenciaCaja', () => {
  it('positivo si sobra, negativo si falta, cero si cuadra', () => {
    expect(diferenciaCaja(13790, 13800)).toBe(10);
    expect(diferenciaCaja(13790, 13000)).toBe(-790);
    expect(diferenciaCaja(13790, 13790)).toBe(0);
  });

  it('rechaza montos inválidos', () => {
    expect(() => diferenciaCaja(100, -1)).toThrow(ErrorDominio);
    expect(() => diferenciaCaja(100.5, 100)).toThrow(ErrorDominio);
    expect(() => diferenciaCaja(100, 0.5)).toThrow(ErrorDominio);
  });
});
