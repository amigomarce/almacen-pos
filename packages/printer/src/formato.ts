import type { MedioPago } from '@almacen/core';

export const ZONA_HORARIA = 'America/Santiago';

/** "25-10-2026 09:44" en hora de Chile. */
export function fechaHora(fecha: Date, zona = ZONA_HORARIA): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: zona,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${partes['day']}-${partes['month']}-${partes['year']} ${partes['hour']}:${partes['minute']}`;
}

export const NOMBRE_MEDIO: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  TRANSFERENCIA: 'Transferencia',
  FIADO: 'Fiado',
};

export interface DatosLocal {
  razonSocial: string | null;
  rut: string | null;
  giro?: string | null;
  direccion: string | null;
  comuna: string | null;
}
