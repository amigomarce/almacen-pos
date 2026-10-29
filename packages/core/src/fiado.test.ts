import { describe, expect, it } from 'vitest';
import { cuadrarCaja } from './caja.js';
import { ErrorDominio } from './errores.js';
import { evaluarFiado, saldoCuenta, validarAbono } from './fiado.js';
import { calcularCobro, MEDIOS_ABONO, MEDIOS_PAGO } from './pago.js';

describe('fiado', () => {
  it('FIADO es un medio de pago, pero no se abona con fiado', () => {
    expect(MEDIOS_PAGO).toContain('FIADO');
    expect(MEDIOS_ABONO).not.toContain('FIADO');
  });

  it('una venta fiada no se redondea (no es efectivo)', () => {
    expect(calcularCobro(1293, 'FIADO')).toEqual({
      totalClp: 1293,
      redondeoClp: 0,
      totalACobrarClp: 1293,
    });
  });

  it('el saldo es la suma de los movimientos', () => {
    expect(saldoCuenta([])).toBe(0);
    expect(saldoCuenta([{ montoClp: 5000 }, { montoClp: 3290 }, { montoClp: -2000 }])).toBe(6290);
    expect(() => saldoCuenta([{ montoClp: 1.5 }])).toThrow(ErrorDominio);
  });

  it('el límite no bloquea: dice si hace falta la clave del dueño', () => {
    expect(evaluarFiado(8000, 1990, 10000)).toEqual({ saldoNuevoClp: 9990, excedeLimite: false });
    expect(evaluarFiado(8000, 2000, 10000)).toEqual({ saldoNuevoClp: 10000, excedeLimite: false });
    expect(evaluarFiado(8000, 2001, 10000)).toEqual({ saldoNuevoClp: 10001, excedeLimite: true });
    expect(evaluarFiado(900000, 5000, null).excedeLimite).toBe(false);
    expect(() => evaluarFiado(0, 0, null)).toThrow('mayor que cero');
    expect(() => evaluarFiado(0, 100, 1.5)).toThrow(ErrorDominio);
  });

  it('el abono es positivo y no puede pasar la deuda', () => {
    expect(() => {
      validarAbono(5000, 5000);
    }).not.toThrow();
    expect(() => {
      validarAbono(5000, 5001);
    }).toThrow('mayor que lo que debe');
    expect(() => {
      validarAbono(0, 100);
    }).toThrow('no tiene deuda');
    expect(() => {
      validarAbono(5000, 0);
    }).toThrow('mayor que cero');
  });
});

describe('cuadratura con fiado', () => {
  it('las ventas fiadas no suman efectivo; los abonos en efectivo sí', () => {
    const c = cuadrarCaja(
      10000,
      [
        { medioPago: 'EFECTIVO', totalClp: 2000, redondeoClp: 0, anulada: false },
        { medioPago: 'FIADO', totalClp: 7000, redondeoClp: 0, anulada: false },
      ],
      [],
      [],
      [
        { medioPago: 'EFECTIVO', montoClp: 3000 },
        { medioPago: 'TRANSFERENCIA', montoClp: 4000 },
      ],
    );
    expect(c.porMedio.FIADO).toEqual({ cantidad: 1, cobradoClp: 7000 });
    expect(c.abonos).toEqual({ cantidad: 2, totalClp: 7000, efectivoClp: 3000 });
    expect(c.efectivoEsperadoClp).toBe(10000 + 2000 + 3000);
  });

  it('rechaza abonos inválidos', () => {
    expect(() => cuadrarCaja(0, [], [], [], [{ medioPago: 'EFECTIVO', montoClp: 0 }])).toThrow(
      ErrorDominio,
    );
  });
});
