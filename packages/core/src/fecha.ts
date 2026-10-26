import { ErrorDominio } from './errores.js';

/** Zona horaria del local. Resuelve el horario de verano de Chile. */
export const ZONA_CHILE = 'America/Santiago';

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zona, f);
  }
  return f;
}

/** Fecha y hora de reloj en la zona, como números. */
function reloj(instante: number, zona: string) {
  const p: Record<string, number> = {};
  for (const parte of formateador(zona).formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = Number(parte.value);
  }
  return {
    anio: p['year'] ?? 0,
    mes: p['month'] ?? 0,
    dia: p['day'] ?? 0,
    hora: p['hour'] ?? 0,
    minuto: p['minute'] ?? 0,
    segundo: p['second'] ?? 0,
  };
}

/** Desfase de la zona respecto de UTC en ese instante, en ms (Chile: −3 h o −4 h). */
function desfase(instante: number, zona: string): number {
  const r = reloj(instante, zona);
  const comoUtc = Date.UTC(r.anio, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/**
 * Instante en que empezó el día calendario de `ahora` en la zona (por defecto Chile). Sirve
 * para "ventas de hoy" aunque el servidor corra en UTC.
 *
 * En Chile el cambio de hora ocurre a las 24:00: el día en que se adelanta el reloj empieza
 * a la 01:00 local, y el día en que se atrasa dura 25 h. Por eso se prueban los dos desfases
 * posibles y se toma el primero que cae en ese mismo día.
 */
export function inicioDelDia(ahora: Date, zona: string = ZONA_CHILE): Date {
  const t = ahora.getTime();
  if (Number.isNaN(t)) throw new ErrorDominio('FECHA_INVALIDA', 'La fecha no es válida');
  const hoy = reloj(t, zona);
  const medianocheUtc = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia);
  const primero = medianocheUtc - desfase(medianocheUtc, zona);
  const segundo = medianocheUtc - desfase(primero, zona);
  const mismoDia = (c: number) => {
    const r = reloj(c, zona);
    return r.anio === hoy.anio && r.mes === hoy.mes && r.dia === hoy.dia;
  };
  const candidatos = [primero, segundo].filter(mismoDia);
  /* v8 ignore next -- uno de los dos desfases siempre cae en el día */
  if (candidatos.length === 0) return new Date(primero);
  return new Date(Math.min(...candidatos));
}
