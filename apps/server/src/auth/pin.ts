import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const LARGO_HASH = 32;

/** PIN de 4 a 8 dígitos para entrar a la caja. Se guarda como `scrypt$salt$hash` (hex). */
export function hashearPin(pin: string): string {
  if (!/^\d{4,8}$/.test(pin)) throw new RangeError('El PIN debe tener entre 4 y 8 dígitos');
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, LARGO_HASH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verificarPin(pin: string, guardado: string): boolean {
  const [algoritmo, saltHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length !== LARGO_HASH) return false;
  const calculado = scryptSync(pin, Buffer.from(saltHex, 'hex'), LARGO_HASH);
  return timingSafeEqual(calculado, esperado);
}
