import { describe, expect, it } from 'vitest';
import { ErrorDominio } from './errores.js';
import { inicioDelDia, ZONA_CHILE } from './fecha.js';

const inicio = (iso: string, zona?: string) => inicioDelDia(new Date(iso), zona).toISOString();

describe('inicioDelDia (hora de Chile)', () => {
  it('invierno (UTC−4): el día empieza a las 04:00 UTC', () => {
    expect(inicio('2026-07-15T15:00:00Z')).toBe('2026-07-15T04:00:00.000Z');
  });

  it('verano (UTC−3): el día empieza a las 03:00 UTC', () => {
    expect(inicio('2026-01-15T15:00:00Z')).toBe('2026-01-15T03:00:00.000Z');
  });

  it('cerca de medianoche usa el día de Chile, no el de UTC', () => {
    // 23:30 del 25-oct en Chile = 02:30 del 26-oct en UTC.
    expect(inicio('2026-10-26T02:30:00Z')).toBe('2026-10-25T03:00:00.000Z');
    // 00:00 exacto en Chile.
    expect(inicio('2026-10-25T03:00:00Z')).toBe('2026-10-25T03:00:00.000Z');
    expect(inicio('2026-10-25T02:59:59Z')).toBe('2026-10-24T03:00:00.000Z');
  });

  it('día en que se adelanta el reloj (6-sep-2026): empieza a la 01:00 local', () => {
    expect(inicio('2026-09-06T12:00:00Z')).toBe('2026-09-06T04:00:00.000Z');
    expect(inicio('2026-09-05T12:00:00Z')).toBe('2026-09-05T04:00:00.000Z');
    expect(inicio('2026-09-07T12:00:00Z')).toBe('2026-09-07T03:00:00.000Z');
  });

  it('día en que se atrasa el reloj (5-abr-2026): dura 25 h', () => {
    expect(inicio('2026-04-04T12:00:00Z')).toBe('2026-04-04T03:00:00.000Z');
    // 23:30 del sábado, en la hora repetida (ya en UTC−4).
    expect(inicio('2026-04-05T03:30:00Z')).toBe('2026-04-04T03:00:00.000Z');
    expect(inicio('2026-04-05T12:00:00Z')).toBe('2026-04-05T04:00:00.000Z');
  });

  it('acepta otra zona y usa Chile por defecto', () => {
    expect(ZONA_CHILE).toBe('America/Santiago');
    expect(inicio('2026-07-15T15:00:00Z', 'UTC')).toBe('2026-07-15T00:00:00.000Z');
  });

  it('rechaza una fecha inválida', () => {
    expect(() => inicioDelDia(new Date('no'))).toThrow(ErrorDominio);
  });
});
