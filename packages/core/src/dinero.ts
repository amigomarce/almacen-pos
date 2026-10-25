import { asegurarEntero } from './aritmetica.js';

/** Monto en pesos chilenos, siempre entero (CLAUDE.md §3). */
export type Clp = number;

const separarMiles = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Formato chileno: 1290 → "$1.290"; -500 → "-$500". Lanza si el monto no es entero. */
export function formatearClp(monto: Clp): string {
  asegurarEntero(monto, 'monto');
  const signo = monto < 0 ? '-' : '';
  return `${signo}$${separarMiles(Math.abs(monto))}`;
}

const PATRON_CLP = /^(-)?\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)$/;

/**
 * Lee un monto escrito por una persona: "$1.290", "1.290", "1290", "-$500".
 * Devuelve `null` si no es un monto entero válido (decimales, comas, puntos mal ubicados).
 */
export function parsearClp(texto: string): Clp | null {
  const limpio = texto.trim();
  const m = PATRON_CLP.exec(limpio);
  if (!m?.[2]) return null;
  const valor = Number(m[2].replaceAll('.', ''));
  if (!Number.isSafeInteger(valor)) return null;
  if (m[1] && valor === 0) return 0;
  return m[1] ? -valor : valor;
}
