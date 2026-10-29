import type { SesionCaja } from '../api.js';

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  });

/**
 * Para el dueño: la app se cerró durante el turno sin hacer el cierre de caja (cierre forzado o
 * corte de luz). Queda en el registro del turno (ADR-019).
 */
export function AvisoCierresInesperados({ sesion }: { sesion: SesionCaja }) {
  const registro = sesion.cierresInesperados;
  if (!registro || registro.cantidad === 0) return null;
  const veces = registro.cantidad === 1 ? '1 vez' : `${registro.cantidad} veces`;
  return (
    <p className="accion-cajero" role="note" aria-label="Cierres inesperados">
      La caja se cerró sin hacer el cierre de caja (cierre forzado o corte de luz) {veces} en este
      turno{registro.ultimo ? `, la última el ${fecha(registro.ultimo)}` : ''}.
    </p>
  );
}
