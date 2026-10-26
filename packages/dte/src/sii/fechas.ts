import { ErrorDominio } from '@almacen/core';

/**
 * Fechas del DTE en hora de Chile, sin importar la zona horaria del servidor.
 *
 * `FchEmis`, `TSTED` y `TmstFirma` son fechas locales del emisor. Si el servidor corre en
 * UTC (contenedor), formatear con `getFullYear()`/`getHours()` desplazaría el día cerca de
 * medianoche. `America/Santiago` resuelve además el horario de verano.
 */
const ZONA = 'America/Santiago';

const FORMATEADOR = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partes(f: Date): Record<string, string> {
  if (Number.isNaN(f.getTime())) {
    throw new ErrorDominio('FECHA_INVALIDA', 'La fecha del documento no es válida');
  }
  const salida: Record<string, string> = {};
  for (const p of FORMATEADOR.formatToParts(f)) {
    if (p.type !== 'literal') salida[p.type] = p.value;
  }
  return salida;
}

function parte(p: Record<string, string>, clave: string): string {
  const valor = p[clave];
  if (valor === undefined) {
    throw new ErrorDominio('FECHA_INVALIDA', `No se pudo formatear la fecha (${clave})`);
  }
  return valor;
}

/** AAAA-MM-DD en hora de Chile. */
export function fechaDte(f: Date): string {
  const p = partes(f);
  return `${parte(p, 'year')}-${parte(p, 'month')}-${parte(p, 'day')}`;
}

/** AAAA-MM-DDTHH:MM:SS en hora de Chile. */
export function fechaHoraDte(f: Date): string {
  const p = partes(f);
  return `${parte(p, 'year')}-${parte(p, 'month')}-${parte(p, 'day')}T${parte(p, 'hour')}:${parte(p, 'minute')}:${parte(p, 'second')}`;
}
