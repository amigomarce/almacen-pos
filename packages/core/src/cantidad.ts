import { asegurarEntero } from './aritmetica.js';
import type { Unidad } from './venta.js';

/**
 * Cantidad en milésimas (ADR-002) para mostrar: unidades → "3"; kg → "1,250 kg".
 * Por unidad sin fracción no lleva decimales; si la hubiera (dato antiguo), muestra los necesarios.
 */
export function formatearCantidad(cantidadMilli: number, unidad: Unidad): string {
  asegurarEntero(cantidadMilli, 'cantidadMilli');
  const signo = cantidadMilli < 0 ? '-' : '';
  const abs = Math.abs(cantidadMilli);
  const enteros = Math.floor(abs / 1000);
  const fraccion = String(abs % 1000).padStart(3, '0');
  if (unidad === 'KG') return `${signo}${enteros},${fraccion} kg`;
  const decimales = fraccion.replace(/0+$/, '');
  return decimales === '' ? `${signo}${enteros}` : `${signo}${enteros},${decimales}`;
}

const PATRON_CANTIDAD = /^(\d{1,6})(?:[.,](\d{1,3}))?$/;

/**
 * Lee lo que escribe el cajero: "3", "1,25", "1.250", "0,5". Devuelve milésimas o `null` si no
 * es válido. Por unidad no acepta fracciones. Nunca usa float (ADR-002).
 */
export function parsearCantidad(texto: string, unidad: Unidad): number | null {
  const m = PATRON_CANTIDAD.exec(texto.trim().replace(/\s*kg$/i, ''));
  if (!m?.[1]) return null;
  const milli = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
  if (milli === 0) return null;
  if (unidad === 'UN' && milli % 1000 !== 0) return null;
  return milli;
}
