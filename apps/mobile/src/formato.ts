/** Formato de montos y cantidades sin depender de Intl (Hermes lo trae incompleto). */

/** `$1.290` (punto de miles, sin decimales). */
export function formatearClp(monto: number): string {
  const entero = Math.round(Math.abs(monto));
  const conPuntos = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${monto < 0 ? '-' : ''}$${conPuntos}`;
}

/** `1,250 kg` o `3 un.` a partir de milésimas. */
export function formatearCantidad(milli: number, unidad: string): string {
  if (unidad === 'KG') return `${(milli / 1000).toFixed(3).replace('.', ',')} kg`;
  return `${Math.round(milli / 1000)} un.`;
}
