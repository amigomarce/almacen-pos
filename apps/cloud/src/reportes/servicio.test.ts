import { describe, expect, it } from 'vitest';
import { calcularStockBajo, resumirVentas } from './servicio.js';

describe('resumirVentas', () => {
  it('suma el total y desglosa por medio de pago', () => {
    const r = resumirVentas([
      { totalClp: 1000, paymentMethod: 'EFECTIVO' },
      { totalClp: 500, paymentMethod: 'EFECTIVO' },
      { totalClp: 2000, paymentMethod: 'DEBITO' },
    ]);
    expect(r).toEqual({
      totalClp: 3500,
      cantidad: 3,
      porMedio: { EFECTIVO: 1500, DEBITO: 2000 },
      devolucionesClp: 0,
    });
  });

  it('resta las devoluciones (ventas netas)', () => {
    const r = resumirVentas(
      [
        { totalClp: 3000, paymentMethod: 'EFECTIVO' },
        { totalClp: 2000, paymentMethod: 'DEBITO' },
      ],
      [{ refundClp: 1890, paymentMethod: 'EFECTIVO' }],
    );
    expect(r).toEqual({
      totalClp: 3110,
      cantidad: 2,
      porMedio: { EFECTIVO: 1110, DEBITO: 2000 },
      devolucionesClp: 1890,
    });
  });

  it('devuelve cero con ventas vacías', () => {
    expect(resumirVentas([])).toEqual({
      totalClp: 0,
      cantidad: 0,
      porMedio: {},
      devolucionesClp: 0,
    });
  });
});

describe('calcularStockBajo', () => {
  it('calcula el saldo y filtra bajo el mínimo', () => {
    const r = calcularStockBajo(
      [
        { id: 'a', name: 'A', unit: 'UN', stockMinMilli: 5000 },
        { id: 'b', name: 'B', unit: 'UN', stockMinMilli: 2000 },
        { id: 'c', name: 'C', unit: 'UN', stockMinMilli: null },
      ],
      [
        { productId: 'a', qty: 1000 },
        { productId: 'b', qty: 5000 },
        { productId: 'a', qty: 500 },
      ],
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'a', stockQtyMilli: 1500, stockMinMilli: 5000 });
  });

  it('ordena por el más crítico primero', () => {
    const r = calcularStockBajo(
      [
        { id: 'a', name: 'A', unit: 'UN', stockMinMilli: 1000 },
        { id: 'b', name: 'B', unit: 'UN', stockMinMilli: 1000 },
      ],
      [
        { productId: 'a', qty: 100 },
        { productId: 'b', qty: 900 },
      ],
    );
    expect(r.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
