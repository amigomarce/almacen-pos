/** Formatea fechas con la hora local (Chile) para el DTE. */

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

/** AAAA-MM-DD. */
export function fechaDte(f: Date): string {
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
}

/** AAAA-MM-DDTHH:MM:SS. */
export function fechaHoraDte(f: Date): string {
  return `${fechaDte(f)}T${dos(f.getHours())}:${dos(f.getMinutes())}:${dos(f.getSeconds())}`;
}
