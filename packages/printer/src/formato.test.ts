import { describe, expect, it } from 'vitest';
import { fechaHora } from './formato.js';

describe('fechaHora', () => {
  it('usa la hora de Chile, con horario de verano e invierno', () => {
    expect(fechaHora(new Date('2026-10-25T12:44:00Z'))).toBe('25-10-2026 09:44'); // UTC-3
    expect(fechaHora(new Date('2026-07-01T04:05:00Z'))).toBe('01-07-2026 00:05'); // UTC-4
  });
});
