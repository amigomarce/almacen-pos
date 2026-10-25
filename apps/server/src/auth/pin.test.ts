import { describe, expect, it } from 'vitest';
import { hashearPin, verificarPin } from './pin.js';

describe('PIN', () => {
  it('verifica el PIN correcto y rechaza otro', () => {
    const h = hashearPin('1234');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(verificarPin('1234', h)).toBe(true);
    expect(verificarPin('1235', h)).toBe(false);
  });

  it('usa sal distinta cada vez', () => {
    expect(hashearPin('1234')).not.toBe(hashearPin('1234'));
  });

  it.each(['123', '123456789', 'abcd', '12 34', ''])('rechaza PIN "%s"', (pin) => {
    expect(() => hashearPin(pin)).toThrow(RangeError);
  });

  it.each(['', 'plano', 'md5$aa$bb', 'scrypt$aa', 'scrypt$aa$bb'])(
    'hash guardado inválido "%s" → false',
    (guardado) => {
      expect(verificarPin('1234', guardado)).toBe(false);
    },
  );
});
