/** Lo que el cajero escribió (o el lector "tipeó") en el campo de escaneo. */
export type Entrada =
  | { tipo: 'VACIA' }
  | { tipo: 'CODIGO'; codigo: string; multiplicador: number | null }
  | { tipo: 'TEXTO'; texto: string }
  | { tipo: 'INVALIDA'; mensaje: string };

const MULT_MAX = 999;

/**
 * - "7801234567890" → código.
 * - "3*7801234567890" o "3x7801234567890" → 3 unidades de ese código.
 * - "leche" → texto para buscar por nombre.
 */
export function leerEntrada(bruto: string): Entrada {
  const t = bruto.trim();
  if (t === '') return { tipo: 'VACIA' };
  const m = /^(\d{1,4})\s*[*xX]\s*(\d+)$/.exec(t);
  if (m?.[1] && m[2]) {
    const n = Number(m[1]);
    if (n < 1 || n > MULT_MAX)
      return { tipo: 'INVALIDA', mensaje: `La cantidad debe estar entre 1 y ${MULT_MAX}` };
    return { tipo: 'CODIGO', codigo: m[2], multiplicador: n };
  }
  if (/^\d+$/.test(t)) return { tipo: 'CODIGO', codigo: t, multiplicador: null };
  return { tipo: 'TEXTO', texto: t };
}
