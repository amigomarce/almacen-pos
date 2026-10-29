import { formatearClp } from '@almacen/core';
import { useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type VentaDelTurno } from '../api.js';
import { ModalVentaTurno } from './ModalVentaTurno.js';

const NOMBRE_MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  TRANSFERENCIA: 'Transf.',
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  });

/**
 * Caja → Ventas del turno: todas las ventas del turno abierto. Cada una se abre para
 * reimprimirla, anularla o devolver algunos productos.
 */
export function SeccionVentasTurno({
  api,
  esDueno,
  version,
  alCambiar,
}: {
  api: ClienteApi;
  esDueno: boolean;
  /** Cambia cuando hay que recargar (venta anulada, devolución, cierre). */
  version: number;
  alCambiar: () => void;
}) {
  const [ventas, setVentas] = useState<VentaDelTurno[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api
      .ventasDelTurno()
      .then((v) => {
        if (vigente) setVentas(v);
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las ventas');
        }
      });
    return () => {
      vigente = false;
    };
  }, [api, version]);

  return (
    <div className="tarjeta" id="ventas-turno">
      <h2>Ventas del turno</h2>
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      {ventas?.length === 0 && <p className="suave">Todavía no hay ventas en este turno.</p>}
      {ventas && ventas.length > 0 && (
        <table className="tabla tabla-clicable" aria-label="Lista de ventas del turno">
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id}>
                <td>
                  <button
                    type="button"
                    className="boton-texto"
                    onClick={() => {
                      setAbierta(v.id);
                    }}
                  >
                    N° {v.numero} · {hora(v.creadaEn)}
                  </button>
                  <span className="suave">
                    {' '}
                    {NOMBRE_MEDIO[v.medioPago]} · {v.cajero}
                    {v.estado === 'ANULADA' && ' · anulada'}
                    {v.devueltoClp > 0 && ` · devuelto ${formatearClp(v.devueltoClp)}`}
                  </span>
                </td>
                <td className={v.estado === 'ANULADA' ? 'numero tachado' : 'numero'}>
                  {formatearClp(v.totalCobradoClp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {abierta && (
        <ModalVentaTurno
          api={api}
          ventaId={abierta}
          esDueno={esDueno}
          alCambiar={alCambiar}
          alCerrar={() => {
            setAbierta(null);
          }}
        />
      )}
    </div>
  );
}
