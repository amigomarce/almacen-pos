import { describe, expect, it } from 'vitest';
import { BLOQUEO_MS, LimitadorIntentos, MAX_INTENTOS } from './intentos.js';

describe('LimitadorIntentos', () => {
  it('bloquea tras 5 fallos y libera después de 1 minuto', () => {
    let t = 1000;
    const l = new LimitadorIntentos(() => t);
    for (let i = 1; i < MAX_INTENTOS; i++) {
      expect(l.fallo('u')).toBe(MAX_INTENTOS - i);
      expect(l.estado('u')).toEqual({ bloqueado: false });
    }
    expect(l.fallo('u')).toBe(0);
    expect(l.estado('u')).toEqual({ bloqueado: true, segundosRestantes: 60 });
    t += BLOQUEO_MS - 1500;
    expect(l.estado('u')).toEqual({ bloqueado: true, segundosRestantes: 2 });
    t += 1500;
    expect(l.estado('u')).toEqual({ bloqueado: false });
    // Tras el bloqueo vuelve a tener todos los intentos.
    expect(l.fallo('u')).toBe(MAX_INTENTOS - 1);
  });

  it('un acierto borra los fallos previos', () => {
    const l = new LimitadorIntentos();
    l.fallo('u');
    l.fallo('u');
    l.exito('u');
    expect(l.fallo('u')).toBe(MAX_INTENTOS - 1);
  });

  it('cuenta cada clave por separado', () => {
    const l = new LimitadorIntentos(() => 0, 2, 1000);
    l.fallo('a');
    l.fallo('a');
    expect(l.estado('a').bloqueado).toBe(true);
    expect(l.estado('b').bloqueado).toBe(false);
  });
});
