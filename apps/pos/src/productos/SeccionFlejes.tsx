import { formatearClp } from '@almacen/core';
import { useCallback, useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type FlejePendiente } from '../api.js';

/**
 * Productos → Etiquetas por cambiar. Cuando cambia un precio (en la caja, en masa o desde el
 * celular), la caja ya cobra el nuevo pero el fleje de la góndola sigue con el viejo. Aquí se
 * imprimen en la térmica o se marcan como cambiados a mano.
 */
export function SeccionFlejes({ api }: { api: ClienteApi }) {
  const [flejes, setFlejes] = useState<FlejePendiente[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    api
      .flejesPendientes()
      .then((f) => {
        setFlejes(f);
        setElegidos(new Set(f.map((x) => x.id)));
      })
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las etiquetas');
      });
  }, [api]);
  useEffect(cargar, [cargar]);

  if (!flejes || flejes.length === 0) {
    return error ? (
      <p className="mensaje-error" role="alert">
        {error}
      </p>
    ) : null;
  }

  const ids = flejes.filter((f) => elegidos.has(f.id)).map((f) => f.id);

  const imprimir = async () => {
    setTrabajando(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await api.imprimirFlejes(ids);
      if (r.impreso) {
        setMensaje(
          `${ids.length === 1 ? '1 etiqueta impresa' : `${ids.length} etiquetas impresas`}.`,
        );
        setVistaPrevia(null);
        cargar();
      } else {
        setMensaje('No hay impresora configurada: esta es la vista previa.');
        setVistaPrevia(r.vistaPrevia);
      }
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron imprimir');
    } finally {
      setTrabajando(false);
    }
  };

  const marcar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await api.flejesAlDia(ids);
      setMensaje('Etiquetas marcadas como cambiadas.');
      setVistaPrevia(null);
      cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron marcar');
    } finally {
      setTrabajando(false);
    }
  };

  const alternar = (id: string) => {
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className="tarjeta" id="flejes">
      <div className="fila">
        <h2>Etiquetas de precio por cambiar ({flejes.length})</h2>
        <button
          type="button"
          className="boton boton-chico"
          aria-expanded={abierta}
          onClick={() => {
            setAbierta((a) => !a);
          }}
        >
          {abierta ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      <p className="suave">
        Cambió el precio y el fleje de la góndola todavía muestra el anterior.
      </p>
      {abierta && (
        <>
          <table className="tabla" aria-label="Etiquetas por cambiar">
            <tbody>
              {flejes.map((f) => (
                <tr key={f.id}>
                  <td>
                    <label className="casilla">
                      <input
                        type="checkbox"
                        checked={elegidos.has(f.id)}
                        onChange={() => {
                          alternar(f.id);
                        }}
                      />
                      {f.nombre}
                      {f.formato && <span className="suave"> {f.formato}</span>}
                    </label>
                  </td>
                  <td className="numero">
                    {f.precioEtiquetaClp !== null && (
                      <span className="tachado">{formatearClp(f.precioEtiquetaClp)}</span>
                    )}{' '}
                    <strong>
                      {formatearClp(f.precioClp)}
                      {f.unidad === 'KG' ? '/kg' : ''}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fila fila-izquierda">
            <button
              type="button"
              className="boton"
              disabled={trabajando || ids.length === 0}
              onClick={() => void imprimir()}
            >
              Imprimir etiquetas ({ids.length})
            </button>
            <button
              type="button"
              className="boton boton-texto"
              disabled={trabajando || ids.length === 0}
              onClick={() => void marcar()}
            >
              Ya las cambié a mano
            </button>
          </div>
        </>
      )}
      {mensaje && (
        <p className="mensaje-aviso" role="status">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      {vistaPrevia && (
        <pre className="ticket" aria-label="Vista previa de las etiquetas">
          {vistaPrevia}
        </pre>
      )}
    </div>
  );
}
