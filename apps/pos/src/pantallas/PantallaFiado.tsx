import { formatearClp } from '@almacen/core';
import { useCallback, useEffect, useState } from 'react';
import {
  ErrorApi,
  type Cliente,
  type ClienteApi,
  type MedioAbono,
  type MovimientoFiado,
} from '../api.js';

const MEDIOS: { medio: MedioAbono; etiqueta: string }[] = [
  { medio: 'EFECTIVO', etiqueta: 'Efectivo' },
  { medio: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { medio: 'DEBITO', etiqueta: 'Débito' },
  { medio: 'CREDITO', etiqueta: 'Crédito' },
];

const TIPO: Record<MovimientoFiado['tipo'], string> = {
  VENTA: 'Venta fiada',
  ABONO: 'Abono',
  ANULACION: 'Venta anulada',
  DEVOLUCION: 'Devolución',
  AJUSTE: 'Ajuste',
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  });

const digitos = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);

/** Formulario de alta o edición de un vecino (solo el dueño). */
function FormularioVecino({
  inicial,
  alGuardar,
  alCancelar,
}: {
  inicial: Cliente | null;
  alGuardar: (datos: {
    nombre: string;
    telefono: string | null;
    limiteClp: number | null;
    activo: boolean;
  }) => Promise<void>;
  alCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '');
  const [limite, setLimite] = useState(
    inicial?.limiteClp === null || inicial === null ? '' : String(inicial.limiteClp),
  );
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (nombre.trim() === '') {
      setError('Escribe el nombre del vecino');
      return;
    }
    try {
      await alGuardar({
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        limiteClp: limite === '' ? null : Number(limite),
        activo,
      });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <div className="tarjeta">
      <h2>{inicial ? `Editar ${inicial.nombre}` : 'Nuevo vecino'}</h2>
      <div className="formulario">
        <label className="etiqueta-campo">
          Nombre
          <input
            className="campo"
            maxLength={80}
            autoFocus
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
          />
        </label>
        <label className="etiqueta-campo">
          Teléfono (opcional)
          <input
            className="campo"
            inputMode="tel"
            maxLength={30}
            value={telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
            }}
          />
        </label>
        <label className="etiqueta-campo">
          Límite de deuda (vacío = sin límite)
          <input
            className="campo campo-monto"
            inputMode="numeric"
            placeholder="Sin límite"
            value={limite === '' ? '' : formatearClp(Number(limite))}
            onChange={(e) => {
              setLimite(digitos(e.target.value));
            }}
          />
        </label>
      </div>
      {inicial && (
        <label className="casilla">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => {
              setActivo(e.target.checked);
            }}
          />
          Cuenta habilitada (sin marcar, no se le puede fiar)
        </label>
      )}
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <div className="fila fila-izquierda">
        <button type="button" className="boton" onClick={() => void guardar()}>
          Guardar
        </button>
        <button type="button" className="boton boton-texto" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Detalle de la cuenta de un vecino: movimientos, abonos y (dueño) ajustes. */
function CuentaVecino({
  api,
  clienteId,
  esDueno,
  alCambiar,
  alEditar,
  alVolver,
}: {
  api: ClienteApi;
  clienteId: string;
  esDueno: boolean;
  alCambiar: () => void;
  alEditar: (c: Cliente) => void;
  alVolver: () => void;
}) {
  const [datos, setDatos] = useState<{ cliente: Cliente; movimientos: MovimientoFiado[] } | null>(
    null,
  );
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState<MedioAbono>('EFECTIVO');
  const [ajuste, setAjuste] = useState('');
  const [aFavor, setAFavor] = useState(true);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    api
      .cliente(clienteId)
      .then(setDatos)
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la cuenta');
      });
  }, [api, clienteId]);
  useEffect(cargar, [cargar]);

  if (!datos) {
    return error ? (
      <p className="mensaje-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="pantalla-centrada">Cargando…</p>
    );
  }
  const { cliente, movimientos } = datos;

  const abonar = async () => {
    setError(null);
    setMensaje(null);
    if (monto === '') {
      setError('Escribe el monto del abono');
      return;
    }
    setTrabajando(true);
    try {
      const r = await api.abonar(cliente.id, Number(monto), medio);
      setMonto('');
      setMensaje(
        `Abono de ${formatearClp(-r.movimiento.montoClp)} registrado. Debe ${formatearClp(r.cliente.saldoClp)}.`,
      );
      cargar();
      alCambiar();
      try {
        const imp = await api.imprimirAbono(cliente.id, r.movimiento.id);
        if (!imp.impreso) setMensaje((m) => `${m ?? ''} (sin impresora: no se imprimió el recibo)`);
      } catch {
        // El abono ya quedó; el recibo se puede reimprimir.
      }
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar el abono');
    } finally {
      setTrabajando(false);
    }
  };

  const ajustar = async () => {
    setError(null);
    setMensaje(null);
    if (ajuste === '' || motivo.trim().length < 3) {
      setError('Escribe el monto y el motivo del ajuste');
      return;
    }
    setTrabajando(true);
    try {
      const r = await api.ajustarCuenta(cliente.id, (aFavor ? -1 : 1) * Number(ajuste), motivo);
      setAjuste('');
      setMotivo('');
      setMensaje(`Ajuste registrado. Debe ${formatearClp(r.cliente.saldoClp)}.`);
      cargar();
      alCambiar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar el ajuste');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="pantalla-caja">
      <div className="tarjeta">
        <div className="fila">
          <h2>{cliente.nombre}</h2>
          <button type="button" className="boton boton-chico" onClick={alVolver}>
            Volver
          </button>
        </div>
        <output aria-label="Saldo del vecino" className="monto-grande">
          Debe {formatearClp(cliente.saldoClp)}
        </output>
        <p className="suave">
          {cliente.limiteClp === null ? 'Sin límite' : `Límite ${formatearClp(cliente.limiteClp)}`}
          {cliente.telefono && ` · ${cliente.telefono}`}
          {!cliente.activo && ' · cuenta deshabilitada'}
        </p>
        {esDueno && (
          <button
            type="button"
            className="boton boton-texto"
            onClick={() => {
              alEditar(cliente);
            }}
          >
            Editar vecino
          </button>
        )}
      </div>

      <div className="tarjeta">
        <h2>Recibir abono</h2>
        <div className="formulario">
          <label className="etiqueta-campo">
            Monto del abono
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
        </div>
        <div className="medios-pago" role="group" aria-label="Medio del abono">
          {MEDIOS.map((m) => (
            <button
              key={m.medio}
              type="button"
              className={m.medio === medio ? 'boton activo' : 'boton'}
              aria-pressed={m.medio === medio}
              onClick={() => {
                setMedio(m.medio);
              }}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
        <div className="fila fila-izquierda">
          <button
            type="button"
            className="boton"
            disabled={trabajando || cliente.saldoClp <= 0}
            onClick={() => void abonar()}
          >
            Registrar abono
          </button>
          {cliente.saldoClp > 0 && (
            <button
              type="button"
              className="boton boton-texto"
              onClick={() => {
                setMonto(String(cliente.saldoClp));
              }}
            >
              Paga todo ({formatearClp(cliente.saldoClp)})
            </button>
          )}
        </div>
      </div>

      {esDueno && (
        <div className="tarjeta">
          <h2>Ajuste de cuenta</h2>
          <p className="suave">Para perdonar una deuda o corregir un error. Queda registrado.</p>
          <fieldset className="opciones opciones-fila">
            <legend>Tipo de ajuste</legend>
            <label className="opcion">
              <input
                type="radio"
                name="tipo-ajuste"
                checked={aFavor}
                onChange={() => {
                  setAFavor(true);
                }}
              />
              <span>Baja la deuda</span>
            </label>
            <label className="opcion">
              <input
                type="radio"
                name="tipo-ajuste"
                checked={!aFavor}
                onChange={() => {
                  setAFavor(false);
                }}
              />
              <span>Sube la deuda</span>
            </label>
          </fieldset>
          <div className="formulario">
            <label className="etiqueta-campo">
              Monto del ajuste
              <input
                className="campo campo-monto"
                inputMode="numeric"
                placeholder="$0"
                value={ajuste === '' ? '' : formatearClp(Number(ajuste))}
                onChange={(e) => {
                  setAjuste(digitos(e.target.value));
                }}
              />
            </label>
            <label className="etiqueta-campo">
              Motivo del ajuste
              <input
                className="campo"
                maxLength={200}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className="boton"
            disabled={trabajando}
            onClick={() => void ajustar()}
          >
            Registrar ajuste
          </button>
        </div>
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

      <div className="tarjeta">
        <h2>Movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="suave">Todavía no hay movimientos.</p>
        ) : (
          <table className="tabla" aria-label="Movimientos de la cuenta">
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>
                    {fecha(m.creadoEn)} · {TIPO[m.tipo]}
                    <span className="suave">
                      {m.medioPago && ` · ${m.medioPago.toLowerCase()}`}
                      {m.motivo && ` · ${m.motivo}`} · {m.usuario}
                    </span>
                    {m.tipo === 'ABONO' && (
                      <button
                        type="button"
                        className="boton boton-texto"
                        onClick={() => {
                          void api.imprimirAbono(cliente.id, m.id).catch(() => undefined);
                        }}
                      >
                        Reimprimir recibo
                      </button>
                    )}
                  </td>
                  <td className={m.montoClp < 0 ? 'numero' : 'numero negativo'}>
                    {m.montoClp > 0 ? '+' : '−'}
                    {formatearClp(Math.abs(m.montoClp))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/**
 * Pestaña Fiado (ADR-022): vecinos con cuenta corriente, lo que deben, abonos y (el dueño)
 * altas, ediciones y ajustes.
 */
export function PantallaFiado({ api, esDueno }: { api: ClienteApi; esDueno: boolean }) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Cliente | 'NUEVO' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let vigente = true;
    api
      .clientes({ inactivos: esDueno, porDeuda: true })
      .then((c) => {
        if (vigente) setClientes(c);
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los vecinos');
      });
    return () => {
      vigente = false;
    };
  }, [api, esDueno, version]);

  if (formulario) {
    const inicial = formulario === 'NUEVO' ? null : formulario;
    return (
      <section className="pantalla-caja">
        <FormularioVecino
          inicial={inicial}
          alCancelar={() => {
            setFormulario(null);
          }}
          alGuardar={async (datos) => {
            const c = inicial
              ? await api.editarCliente(inicial.id, datos)
              : await api.crearCliente(datos);
            setFormulario(null);
            setAbierto(c.id);
            recargar();
          }}
        />
      </section>
    );
  }

  if (abierto) {
    return (
      <CuentaVecino
        api={api}
        clienteId={abierto}
        esDueno={esDueno}
        alCambiar={recargar}
        alEditar={(c) => {
          setFormulario(c);
        }}
        alVolver={() => {
          setAbierto(null);
        }}
      />
    );
  }

  const filtro = texto.trim().toLowerCase();
  const lista = (clientes ?? []).filter((c) => c.nombre.toLowerCase().includes(filtro));
  const enLaCalle = (clientes ?? []).reduce((s, c) => s + Math.max(0, c.saldoClp), 0);

  return (
    <section className="pantalla-caja">
      <div className="tarjeta">
        <div className="fila">
          <h2>Fiado</h2>
          {esDueno && (
            <button
              type="button"
              className="boton"
              onClick={() => {
                setFormulario('NUEVO');
              }}
            >
              Nuevo vecino
            </button>
          )}
        </div>
        <p>
          Total fiado: <strong aria-label="Total fiado">{formatearClp(enLaCalle)}</strong>
        </p>
        <input
          className="campo"
          aria-label="Buscar vecino"
          placeholder="Buscar por nombre"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
          }}
        />
        {error && (
          <p className="mensaje-error" role="alert">
            {error}
          </p>
        )}
        {clientes?.length === 0 && (
          <p className="suave">
            {esDueno
              ? 'Todavía no hay vecinos con cuenta. Crea el primero con "Nuevo vecino".'
              : 'Todavía no hay vecinos con cuenta. El dueño los crea aquí.'}
          </p>
        )}
        {lista.length > 0 && (
          <table className="tabla" aria-label="Vecinos con cuenta">
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      type="button"
                      className="boton-texto"
                      onClick={() => {
                        setAbierto(c.id);
                      }}
                    >
                      {c.nombre}
                    </button>
                    <span className="suave">
                      {c.limiteClp !== null && ` · límite ${formatearClp(c.limiteClp)}`}
                      {!c.activo && ' · deshabilitada'}
                    </span>
                  </td>
                  <td className={c.saldoClp > 0 ? 'numero negativo' : 'numero'}>
                    {formatearClp(c.saldoClp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
