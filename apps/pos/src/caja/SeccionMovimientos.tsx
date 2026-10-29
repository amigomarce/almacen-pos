import { formatearClp } from '@almacen/core';
import { useState } from 'react';
import { ErrorApi, type ClienteApi, type EstadoCaja, type MovimientoCaja } from '../api.js';

const digitos = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  });

/**
 * Retiros e ingresos de efectivo del turno: pago a un proveedor desde la caja, plata que se
 * saca a mitad del día, sencillo que trae el dueño. Ajustan el efectivo esperado del cierre y
 * quedan a nombre de quien los hizo (no se borran).
 */
export function SeccionMovimientos({
  api,
  movimientos,
  alRegistrar,
}: {
  api: ClienteApi;
  movimientos: MovimientoCaja[];
  alRegistrar: (estado: EstadoCaja) => void;
}) {
  const [tipo, setTipo] = useState<MovimientoCaja['tipo']>('RETIRO');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registrar = async () => {
    if (monto === '') {
      setError('Escribe el monto');
      return;
    }
    if (motivo.trim().length < 2) {
      setError('Escribe el motivo (por ejemplo, "Pan Ideal" o "Sencillo")');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await api.registrarMovimiento({ tipo, montoClp: Number(monto), motivo });
      setMonto('');
      setMotivo('');
      alRegistrar(r);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar el movimiento');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="tarjeta" id="movimientos">
      <h2>Retiros e ingresos de efectivo</h2>
      <p className="suave">
        Plata que sale o entra al cajón sin ser una venta. Ajusta el efectivo esperado del cierre.
      </p>
      <fieldset className="opciones opciones-fila">
        <legend>Tipo</legend>
        <label className="opcion">
          <input
            type="radio"
            name="tipo-movimiento"
            checked={tipo === 'RETIRO'}
            onChange={() => {
              setTipo('RETIRO');
            }}
          />
          <span>
            <strong>Retiro</strong>
            <span className="suave">Sale plata (pago a proveedor, retiro del dueño)</span>
          </span>
        </label>
        <label className="opcion">
          <input
            type="radio"
            name="tipo-movimiento"
            checked={tipo === 'INGRESO'}
            onChange={() => {
              setTipo('INGRESO');
            }}
          />
          <span>
            <strong>Ingreso</strong>
            <span className="suave">Entra plata (sencillo, devolución de un préstamo)</span>
          </span>
        </label>
      </fieldset>
      <div className="formulario">
        <label className="etiqueta-campo">
          Monto del movimiento
          <input
            className="campo campo-monto"
            inputMode="numeric"
            placeholder="$0"
            value={monto === '' ? '' : formatearClp(Number(monto))}
            onChange={(e) => {
              setMonto(digitos(e.target.value));
              setError(null);
            }}
          />
        </label>
        <label className="etiqueta-campo">
          Motivo del movimiento
          <input
            className="campo"
            maxLength={80}
            placeholder="Pan Ideal, gas, sencillo…"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
          />
        </label>
      </div>
      <button type="button" className="boton" disabled={guardando} onClick={() => void registrar()}>
        {tipo === 'RETIRO' ? 'Registrar retiro' : 'Registrar ingreso'}
      </button>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      {movimientos.length > 0 && (
        <table className="tabla" aria-label="Movimientos del turno">
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>
                  {hora(m.creadoEn)} · {m.motivo}
                  <span className="suave"> ({m.usuario.name})</span>
                </td>
                <td className={m.tipo === 'RETIRO' ? 'numero negativo' : 'numero'}>
                  {m.tipo === 'RETIRO' ? '−' : '+'}
                  {formatearClp(m.montoClp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
