import { describe, expect, it } from 'vitest';
import { fechaDte, fechaHoraDte } from './fechas.js';

describe('fechas del DTE', () => {
  it('formatea en hora de Chile, no en la zona del servidor', () => {
    // 2026-10-26 02:30 UTC = 2026-10-25 23:30 en Santiago (UTC-3).
    const f = new Date('2026-10-26T02:30:00Z');
    expect(fechaDte(f)).toBe('2026-10-25');
    expect(fechaHoraDte(f)).toBe('2026-10-25T23:30:00');
  });

  it('rechaza una fecha inválida', () => {
    expect(() => fechaDte(new Date('no-es-fecha'))).toThrow(
      expect.objectContaining({ codigo: 'FECHA_INVALIDA' }),
    );
  });
});
