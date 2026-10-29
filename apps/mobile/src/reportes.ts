/** Ayudas puras para la pantalla de Reportes (se prueban sin React Native). */

/** Ancho de cada barra en % del máximo (0 si no hubo ventas). */
export function anchosBarras(valores: readonly number[]): number[] {
  const max = Math.max(0, ...valores);
  return valores.map((v) => (max <= 0 || v <= 0 ? 0 : Math.max(2, Math.round((v / max) * 100))));
}

/** Solo las horas con ventas, para no mostrar 24 filas vacías. */
export function horasConVentas<T extends { hora: number; cantidad: number }>(
  horas: readonly T[],
): T[] {
  return horas.filter((h) => h.cantidad > 0);
}

/** `2026-10-29` → `29/10`. */
export function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia ?? ''}/${mes ?? ''}`;
}

/** `9` → `09:00`. */
export function horaTexto(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`;
}

/** Días de stock con una cifra: `0`, `3,5`, `12`. */
export function diasTexto(dias: number): string {
  const redondeado = Math.round(dias * 10) / 10;
  return Number.isInteger(redondeado) ? String(redondeado) : String(redondeado).replace('.', ',');
}
