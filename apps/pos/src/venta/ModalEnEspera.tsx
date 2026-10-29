import { formatearClp } from '@almacen/core';
import { Modal } from '../componentes/Modal.js';
import { useTeclado } from '../useTeclado.js';
import { totalEnEspera, type VentaEnEspera } from './espera.js';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  });

const resumen = (v: VentaEnEspera) => {
  const nombres = v.lineas.map((l) => l.nombre);
  return nombres.length <= 3 ? nombres.join(', ') : `${nombres.slice(0, 3).join(', ')}…`;
};

/** F8 con varias ventas en espera: elegir cuál retomar (número o clic). */
export function ModalEnEspera({
  ventas,
  hayVentaEnCurso,
  alRetomar,
  alCerrar,
}: {
  ventas: readonly VentaEnEspera[];
  hayVentaEnCurso: boolean;
  alRetomar: (id: string) => void;
  alCerrar: () => void;
}) {
  useTeclado((e) => {
    const n = Number(e.key);
    const v = Number.isInteger(n) && n >= 1 ? ventas[n - 1] : undefined;
    if (v) {
      e.preventDefault();
      alRetomar(v.id);
    }
  });

  return (
    <Modal titulo="Ventas en espera" alCerrar={alCerrar}>
      {hayVentaEnCurso && (
        <p className="suave">La venta en curso queda en espera en lugar de la que retomes.</p>
      )}
      <ol className="lista-espera">
        {ventas.map((v, i) => (
          <li key={v.id}>
            <button
              type="button"
              className="boton boton-espera"
              onClick={() => {
                alRetomar(v.id);
              }}
            >
              <strong>
                {i + 1}. {hora(v.guardadaEn)} · {formatearClp(totalEnEspera(v))}
              </strong>
              <span className="suave">
                {v.lineas.length} {v.lineas.length === 1 ? 'producto' : 'productos'}: {resumen(v)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
