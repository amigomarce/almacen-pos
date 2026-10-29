import { describe, expect, it } from 'vitest';
import { resumirFiado } from './fiado.js';

const d = (iso: string) => new Date(iso);

describe('reporte de fiado', () => {
  it('suma por vecino, solo los que deben, del que más al que menos', () => {
    const r = resumirFiado(
      [
        { id: 'a', name: 'Ana', phone: '+56911111111', creditLimitClp: 5000, active: true },
        { id: 'b', name: 'Beto', phone: null, creditLimitClp: null, active: true },
        { id: 'c', name: 'Caro', phone: null, creditLimitClp: 1000, active: false },
      ],
      [
        { customerId: 'a', type: 'VENTA', amountClp: 3780, createdAt: d('2026-10-20T15:00:00Z') },
        { customerId: 'a', type: 'ABONO', amountClp: -2000, createdAt: d('2026-10-25T15:00:00Z') },
        { customerId: 'b', type: 'VENTA', amountClp: 8000, createdAt: d('2026-10-21T15:00:00Z') },
        { customerId: 'c', type: 'VENTA', amountClp: 1500, createdAt: d('2026-10-22T15:00:00Z') },
        { customerId: 'c', type: 'AJUSTE', amountClp: -1500, createdAt: d('2026-10-23T15:00:00Z') },
      ],
    );
    expect(r.totalClp).toBe(9780);
    expect(r.deudores).toEqual([
      {
        id: 'b',
        nombre: 'Beto',
        telefono: null,
        saldoClp: 8000,
        limiteClp: null,
        sobreLimite: false,
        ultimoAbono: null,
        ultimoMovimiento: '2026-10-21T15:00:00.000Z',
      },
      {
        id: 'a',
        nombre: 'Ana',
        telefono: '+56911111111',
        saldoClp: 1780,
        limiteClp: 5000,
        sobreLimite: false,
        ultimoAbono: '2026-10-25T15:00:00.000Z',
        ultimoMovimiento: '2026-10-25T15:00:00.000Z',
      },
    ]);
  });

  it('marca a quien pasó su límite y no falla sin movimientos', () => {
    const r = resumirFiado(
      [
        { id: 'a', name: 'Ana', phone: null, creditLimitClp: 1000, active: true },
        { id: 'z', name: 'Zoe', phone: null, creditLimitClp: null, active: true },
      ],
      [{ customerId: 'a', type: 'VENTA', amountClp: 1500, createdAt: d('2026-10-20T15:00:00Z') }],
    );
    expect(r.deudores).toHaveLength(1);
    expect(r.deudores[0]?.sobreLimite).toBe(true);
    expect(resumirFiado([], [])).toEqual({ totalClp: 0, deudores: [] });
  });
});
