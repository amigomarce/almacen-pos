import { formatearCantidad, formatearClp, MILI } from '@almacen/core';
import { useCallback, useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type LineaVentaDetalle, type VentaDetalle } from '../api.js';
import { Modal } from '../componentes/Modal.js';

const NOMBRE_MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  TRANSFERENCIA: 'Transferencia',
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  });

const quedaMilli = (l: LineaVentaDetalle) => l.cantidadMilli - l.devueltoMilli;

/** "0,25" o "1" kg → miligramos de kg (milésimas). `null` si no es un número válido. */
function kgAMilli(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  return Math.round(Number(t) * MILI);
}

type Modo = 'VER' | 'DEVOLVER' | 'ANULAR';

/**
 * Detalle de una venta del turno: reimprimir, anular (el dueño, o el cajero con su clave solo
 * la última) o devolver algunos productos (devolución parcial, ADR-021).
 */
export function ModalVentaTurno({
  api,
  ventaId,
  esDueno,
  alCambiar,
  alCerrar,
}: {
  api: ClienteApi;
  ventaId: string;
  esDueno: boolean;
  /** Algo cambió (anulación o devolución): recargar la caja. */
  alCambiar: () => void;
  alCerrar: () => void;
}) {
  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [modo, setModo] = useState<Modo>('VER');
  /** Unidades (UN) o texto en kg (KG) a devolver, por línea. */
  const [devolver, setDevolver] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recordatorio, setRecordatorio] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    api
      .venta(ventaId)
      .then(setVenta)
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la venta');
      });
  }, [api, ventaId]);
  useEffect(cargar, [cargar]);

  const volverAVer = () => {
    setModo('VER');
    setDevolver({});
    setMotivo('');
    setPin('');
    setError(null);
  };

  const reimprimir = async () => {
    setError(null);
    try {
      const r = await api.imprimirVenta(ventaId, true);
      setAviso(r.impreso ? 'Comprobante reimpreso.' : 'No hay impresora configurada.');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo reimprimir');
    }
  };

  const validarAutorizacion = (): boolean => {
    if (motivo.trim().length < 3) {
      setError('Escribe el motivo');
      return false;
    }
    if (!esDueno && pin.length < 4) {
      setError('Se necesita la clave del dueño');
      return false;
    }
    return true;
  };

  const anular = async () => {
    if (!validarAutorizacion()) return;
    setTrabajando(true);
    try {
      const r = await api.anularVenta(ventaId, motivo, esDueno ? undefined : pin);
      setRecordatorio(r.recordatorio);
      setAviso('Venta anulada. El stock fue devuelto.');
      volverAVer();
      cargar();
      alCambiar();
    } catch (e) {
      setPin('');
      setError(e instanceof ErrorApi ? e.message : 'No se pudo anular');
    } finally {
      setTrabajando(false);
    }
  };

  const itemsADevolver = (): { lineaId: string; cantidadMilli: number }[] | null => {
    if (!venta) return null;
    const items: { lineaId: string; cantidadMilli: number }[] = [];
    for (const l of venta.lineas) {
      const valor = devolver[l.id] ?? '';
      const milli = l.unidad === 'KG' ? kgAMilli(valor) : Number(valor || '0') * MILI;
      if (milli === null || !Number.isSafeInteger(milli)) {
        setError(`Cantidad inválida en ${l.nombre}`);
        return null;
      }
      if (milli > quedaMilli(l)) {
        setError(
          `De ${l.nombre} solo se pueden devolver ${formatearCantidad(quedaMilli(l), l.unidad)}`,
        );
        return null;
      }
      if (milli > 0) items.push({ lineaId: l.id, cantidadMilli: milli });
    }
    if (items.length === 0) {
      setError('Elige qué productos se devuelven');
      return null;
    }
    return items;
  };

  const confirmarDevolucion = async () => {
    setError(null);
    const items = itemsADevolver();
    if (!items || !validarAutorizacion()) return;
    setTrabajando(true);
    try {
      const r = await api.devolver(ventaId, {
        items,
        motivo,
        ...(esDueno ? {} : { pinDueno: pin }),
      });
      setRecordatorio(r.recordatorio);
      setAviso(`Devolución registrada: ${formatearClp(r.devolucion.aEntregarClp)}.`);
      volverAVer();
      cargar();
      alCambiar();
    } catch (e) {
      setPin('');
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar la devolución');
    } finally {
      setTrabajando(false);
    }
  };

  const cambiarUnidades = (l: LineaVentaDetalle, delta: number) => {
    const actual = Number(devolver[l.id] ?? '0');
    const max = Math.floor(quedaMilli(l) / MILI);
    const nuevo = Math.min(max, Math.max(0, actual + delta));
    setDevolver((d) => ({ ...d, [l.id]: String(nuevo) }));
    setError(null);
  };

  if (!venta) {
    return (
      <Modal titulo="Venta" alCerrar={alCerrar}>
        <p className="mensaje-error" role="alert">
          {error}
        </p>
        {!error && <p>Cargando…</p>}
      </Modal>
    );
  }

  const anulada = venta.estado === 'ANULADA';
  const hayQueDevolver = venta.lineas.some((l) => quedaMilli(l) > 0);

  return (
    <Modal titulo={`Venta N° ${venta.numero}`} alCerrar={alCerrar}>
      <p className="suave">
        {hora(venta.creadaEn)} · {venta.cajero.name} · {NOMBRE_MEDIO[venta.medioPago]} ·{' '}
        <strong>{formatearClp(venta.totalCobradoClp)}</strong>
        {anulada && <strong className="negativo"> · ANULADA</strong>}
        {venta.devueltoClp > 0 && <> · devuelto {formatearClp(venta.devueltoClp)}</>}
      </p>

      <table className="tabla" aria-label="Productos de la venta">
        <tbody>
          {venta.lineas.map((l) => (
            <tr key={l.id}>
              <td>
                {l.nombre}
                <span className="suave">
                  {' '}
                  {formatearCantidad(l.cantidadMilli, l.unidad)}
                  {l.devueltoMilli > 0 &&
                    ` · devuelto ${formatearCantidad(l.devueltoMilli, l.unidad)}`}
                </span>
              </td>
              <td className="numero">{formatearClp(l.totalLineaClp)}</td>
              {modo === 'DEVOLVER' && (
                <td className="celda-devolver">
                  {quedaMilli(l) === 0 ? (
                    <span className="suave">Devuelto</span>
                  ) : l.unidad === 'KG' ? (
                    <input
                      className="campo campo-chico"
                      inputMode="decimal"
                      aria-label={`Kg a devolver de ${l.nombre}`}
                      placeholder="0,000 kg"
                      value={devolver[l.id] ?? ''}
                      onChange={(e) => {
                        setDevolver((d) => ({ ...d, [l.id]: e.target.value }));
                        setError(null);
                      }}
                    />
                  ) : (
                    <span className="fila">
                      <button
                        type="button"
                        className="boton boton-chico"
                        aria-label={`Una menos de ${l.nombre}`}
                        onClick={() => {
                          cambiarUnidades(l, -1);
                        }}
                      >
                        −
                      </button>
                      <output aria-label={`A devolver de ${l.nombre}`}>
                        {devolver[l.id] ?? '0'}
                      </output>
                      <button
                        type="button"
                        className="boton boton-chico"
                        aria-label={`Una más de ${l.nombre}`}
                        onClick={() => {
                          cambiarUnidades(l, 1);
                        }}
                      >
                        +
                      </button>
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {venta.devoluciones.length > 0 && (
        <ul className="suave" aria-label="Devoluciones de la venta">
          {venta.devoluciones.map((d) => (
            <li key={d.id}>
              {hora(d.creadaEn)} · devolución de {formatearClp(d.totalClp)} ({d.motivo})
            </li>
          ))}
        </ul>
      )}

      {modo !== 'VER' && (
        <div className="formulario">
          <label className="etiqueta-campo">
            {modo === 'DEVOLVER' ? 'Motivo de la devolución' : 'Motivo de la anulación'}
            <input
              className="campo"
              maxLength={200}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
            />
          </label>
          {!esDueno && (
            <label className="etiqueta-campo">
              Clave del dueño
              <input
                className="campo"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
              />
            </label>
          )}
        </div>
      )}

      <p className="mensaje-error" role="alert">
        {error}
      </p>
      {aviso && (
        <p className="mensaje-aviso" role="status">
          {aviso}
        </p>
      )}
      {recordatorio && <p className="accion-cajero">{recordatorio}</p>}

      <div className="fila fila-izquierda">
        {modo === 'VER' && (
          <>
            <button type="button" className="boton" onClick={() => void reimprimir()}>
              Reimprimir
            </button>
            {!anulada && hayQueDevolver && (
              <button
                type="button"
                className="boton"
                onClick={() => {
                  setModo('DEVOLVER');
                  setAviso(null);
                  setRecordatorio(null);
                }}
              >
                Devolver productos
              </button>
            )}
            {!anulada && venta.devoluciones.length === 0 && (
              <button
                type="button"
                className="boton boton-peligro"
                onClick={() => {
                  setModo('ANULAR');
                  setAviso(null);
                  setRecordatorio(null);
                }}
              >
                Anular venta
              </button>
            )}
          </>
        )}
        {modo === 'DEVOLVER' && (
          <>
            <button
              type="button"
              className="boton"
              disabled={trabajando}
              onClick={() => void confirmarDevolucion()}
            >
              Confirmar devolución
            </button>
            <button type="button" className="boton boton-texto" onClick={volverAVer}>
              Volver
            </button>
          </>
        )}
        {modo === 'ANULAR' && (
          <>
            <button
              type="button"
              className="boton boton-peligro"
              disabled={trabajando}
              onClick={() => void anular()}
            >
              Sí, anular venta
            </button>
            <button type="button" className="boton boton-texto" onClick={volverAVer}>
              Volver
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
