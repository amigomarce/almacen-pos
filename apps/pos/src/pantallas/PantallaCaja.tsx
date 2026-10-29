import { formatearClp } from '@almacen/core';
import { useCallback, useEffect, useState } from 'react';
import {
  ErrorApi,
  type CierreCaja,
  type ClienteApi,
  type EstadoCaja,
  type MedioPago,
  type ResultadoImpresion,
  type VentaRegistrada,
} from '../api.js';
import { SeccionMovimientos } from '../caja/SeccionMovimientos.js';
import { AvisoCierresInesperados } from '../componentes/AvisoCierresInesperados.js';
import { leerEnEspera } from '../venta/espera.js';

const MEDIOS: { medio: MedioPago; etiqueta: string }[] = [
  { medio: 'EFECTIVO', etiqueta: 'Efectivo' },
  { medio: 'DEBITO', etiqueta: 'Débito' },
  { medio: 'CREDITO', etiqueta: 'Crédito' },
  { medio: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
];

export function textoDiferencia(d: number): string {
  if (d === 0) return 'Cuadra';
  return d > 0 ? `Sobran ${formatearClp(d)}` : `Faltan ${formatearClp(-d)}`;
}

const digitos = (v: string) =>
  v
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 9);

type UltimaVenta = VentaRegistrada & { creadaEn: string; cajero: { name: string } };

interface Props {
  api: ClienteApi;
  esDueno: boolean;
  /** Al cerrar la caja, la app vuelve a la apertura. */
  alCambiarCaja: (estado: EstadoCaja) => void;
}

/** Resumen del turno, cierre de caja y última venta (reimprimir o anular). */
export function PantallaCaja({ api, esDueno, alCambiarCaja }: Props) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contado, setContado] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [cierre, setCierre] = useState<CierreCaja | null>(null);
  const [impresion, setImpresion] = useState<string | null>(null);
  const [ultima, setUltima] = useState<UltimaVenta | null | 'NINGUNA'>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState('');
  const [recordatorio, setRecordatorio] = useState<string | null>(null);
  const [mensajeVenta, setMensajeVenta] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let vigente = true;
    api
      .estadoCaja()
      .then((e) => {
        if (!vigente) return;
        setEstado(e);
        setError(null);
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo consultar la caja');
      });
    return () => {
      vigente = false;
    };
  }, [api, version]);

  const mostrarImpresion = (r: ResultadoImpresion) => {
    setImpresion(r.impreso ? 'Cierre impreso.' : 'No hay impresora configurada.');
  };

  const cerrar = async () => {
    try {
      const r = await api.cerrarCaja(Number(contado || '0'));
      setCierre(r);
      setConfirmando(false);
      setError(null);
      try {
        mostrarImpresion(await api.imprimirCierre(r.sesion.id));
      } catch (e) {
        setImpresion(e instanceof ErrorApi ? e.message : 'No se pudo imprimir el cierre');
      }
    } catch (e) {
      setConfirmando(false);
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cerrar la caja');
    }
  };

  const verUltima = async () => {
    setRecordatorio(null);
    setMensajeVenta(null);
    try {
      setUltima(await api.ultimaVenta());
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'SIN_VENTAS') setUltima('NINGUNA');
      else setMensajeVenta(e instanceof ErrorApi ? e.message : 'No se pudo cargar la última venta');
    }
  };

  const anular = async () => {
    if (!ultima || ultima === 'NINGUNA') return;
    if (motivo.trim().length < 3) {
      setMensajeVenta('Escribe el motivo de la anulación');
      return;
    }
    if (!esDueno && pin.length < 4) {
      setMensajeVenta('Para anular se necesita la clave del dueño');
      return;
    }
    try {
      const r = await api.anularVenta(ultima.id, motivo, esDueno ? undefined : pin);
      setUltima({ ...ultima, ...r.venta });
      setRecordatorio(r.recordatorio);
      setMensajeVenta('Venta anulada. El stock fue devuelto.');
      setAnulando(false);
      setMotivo('');
      setPin('');
      cargar();
    } catch (e) {
      setPin('');
      setMensajeVenta(e instanceof ErrorApi ? e.message : 'No se pudo anular');
    }
  };

  const reimprimir = async () => {
    if (!ultima || ultima === 'NINGUNA') return;
    try {
      const r = await api.imprimirVenta(ultima.id, true);
      setMensajeVenta(r.impreso ? 'Comprobante reimpreso.' : 'No hay impresora configurada.');
    } catch (e) {
      setMensajeVenta(e instanceof ErrorApi ? e.message : 'No se pudo imprimir');
    }
  };

  // --- Caja recién cerrada ---
  if (cierre) {
    const d = cierre.sesion.diferenciaClp ?? 0;
    return (
      <section className="pantalla-centrada">
        <h2>Caja cerrada</h2>
        <output
          aria-label="Diferencia"
          className={d < 0 ? 'monto-grande negativo' : 'monto-grande'}
        >
          {textoDiferencia(d)}
        </output>
        <p>
          Contado {formatearClp(cierre.sesion.efectivoContadoClp ?? 0)} · esperado{' '}
          {formatearClp(cierre.sesion.efectivoEsperadoClp ?? 0)}
        </p>
        {esDueno && <AvisoCierresInesperados sesion={cierre.sesion} />}
        {cierre.resumen.anuladas.cantidad > 0 && (
          <p className="accion-cajero">
            Hay ventas anuladas: revisa si falta anular boletas en sii.cl o pagos con tarjeta.
          </p>
        )}
        <p className="suave" role="status">
          {impresion}
        </p>
        <button
          type="button"
          className="boton boton-cobrar"
          onClick={() => {
            alCambiarCaja({ caja: cierre.caja, sesion: null });
          }}
        >
          Listo
        </button>
      </section>
    );
  }

  if (error && !estado) {
    return (
      <p className="mensaje-error pantalla-centrada" role="alert">
        {error}
      </p>
    );
  }
  if (!estado) return <p className="pantalla-centrada">Cargando…</p>;
  if (!estado.sesion || !estado.resumen) {
    return <p className="venta-vacia">La caja está cerrada. Ábrela desde la pestaña Venta.</p>;
  }

  const r = estado.resumen;
  const esperado = r.efectivoEsperadoClp;
  const enEspera = leerEnEspera().length;
  const diferencia = Number(contado || '0') - esperado;

  return (
    <section className="pantalla-caja">
      <div className="tarjeta">
        <h2>Turno de {estado.caja.name}</h2>
        <p className="suave">
          Abierta por {estado.sesion.abiertaPor.name} con{' '}
          {formatearClp(estado.sesion.efectivoInicialClp)}
        </p>
        {esDueno && <AvisoCierresInesperados sesion={estado.sesion} />}
        <table className="tabla" aria-label="Ventas del turno">
          <tbody>
            {MEDIOS.map((m) => (
              <tr key={m.medio}>
                <td>
                  {m.etiqueta} ({r.porMedio[m.medio].cantidad})
                </td>
                <td className="numero">{formatearClp(r.porMedio[m.medio].cobradoClp)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total cobrado ({r.cantidadVentas} ventas)</strong>
              </td>
              <td className="numero">
                <strong>{formatearClp(r.totalCobradoClp)}</strong>
              </td>
            </tr>
            {r.redondeoClp !== 0 && (
              <tr>
                <td>Redondeo efectivo</td>
                <td className="numero">{formatearClp(r.redondeoClp)}</td>
              </tr>
            )}
            {r.anuladas.cantidad > 0 && (
              <tr>
                <td>Anuladas ({r.anuladas.cantidad})</td>
                <td className="numero">{formatearClp(r.anuladas.totalClp)}</td>
              </tr>
            )}
            {(r.movimientos?.ingresosClp ?? 0) > 0 && (
              <tr>
                <td>+ Ingresos de efectivo</td>
                <td className="numero">{formatearClp(r.movimientos?.ingresosClp ?? 0)}</td>
              </tr>
            )}
            {(r.movimientos?.retirosClp ?? 0) > 0 && (
              <tr>
                <td>− Retiros de efectivo</td>
                <td className="numero negativo">{formatearClp(r.movimientos?.retirosClp ?? 0)}</td>
              </tr>
            )}
            <tr>
              <td>
                <strong>Efectivo esperado en caja</strong>
              </td>
              <td className="numero">
                <strong>{formatearClp(esperado)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <SeccionMovimientos
        api={api}
        movimientos={estado.movimientos ?? []}
        alRegistrar={(e) => {
          setEstado(e);
        }}
      />

      <div className="tarjeta">
        <h2>Cerrar caja</h2>
        {enEspera > 0 && (
          <p className="accion-cajero" role="note" aria-label="Ventas en espera">
            Hay {enEspera === 1 ? '1 venta' : `${enEspera} ventas`} en espera sin cobrar (Venta →
            F8). No cuentan en el cierre.
          </p>
        )}
        <label className="etiqueta-campo">
          Efectivo contado
          <input
            className="campo campo-monto"
            inputMode="numeric"
            placeholder="$0"
            value={contado === '' ? '' : formatearClp(Number(contado))}
            onChange={(e) => {
              setContado(digitos(e.target.value));
              setConfirmando(false);
            }}
          />
        </label>
        {contado !== '' && (
          <p aria-label="Diferencia al cerrar" className={diferencia < 0 ? 'negativo' : ''}>
            {textoDiferencia(diferencia)}
          </p>
        )}
        <p className="mensaje-error" role="alert">
          {error}
        </p>
        {confirmando ? (
          <div className="fila">
            <span>¿Cerrar la caja? Esto no se puede deshacer.</span>
            <button type="button" className="boton boton-peligro" onClick={() => void cerrar()}>
              Sí, cerrar caja
            </button>
            <button
              type="button"
              className="boton"
              onClick={() => {
                setConfirmando(false);
              }}
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="boton boton-cobrar"
            disabled={contado === ''}
            onClick={() => {
              setConfirmando(true);
            }}
          >
            Cerrar caja
          </button>
        )}
      </div>

      <div className="tarjeta">
        <h2>Última venta</h2>
        {ultima === null && (
          <button type="button" className="boton" onClick={() => void verUltima()}>
            Ver última venta
          </button>
        )}
        {ultima === 'NINGUNA' && <p className="suave">No hay ventas en este turno.</p>}
        {ultima && ultima !== 'NINGUNA' && (
          <>
            <p aria-label="Última venta">
              <strong>Venta N° {ultima.numero}</strong> · {formatearClp(ultima.totalCobradoClp)} ·{' '}
              {MEDIOS.find((m) => m.medio === ultima.medioPago)?.etiqueta} · {ultima.cajero.name}
              {ultima.estado === 'ANULADA' && <strong className="negativo"> · ANULADA</strong>}
            </p>
            <div className="fila fila-izquierda">
              <button type="button" className="boton" onClick={() => void reimprimir()}>
                Reimprimir
              </button>
              {ultima.estado === 'OK' && !anulando && (
                <button
                  type="button"
                  className="boton boton-peligro"
                  onClick={() => {
                    setAnulando(true);
                    setMensajeVenta(null);
                  }}
                >
                  Anular venta
                </button>
              )}
            </div>
            {anulando && (
              <div className="formulario">
                <label className="etiqueta-campo">
                  Motivo
                  <input
                    className="campo"
                    maxLength={200}
                    value={motivo}
                    onChange={(e) => {
                      setMotivo(e.target.value);
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
                      autoComplete="off"
                      maxLength={8}
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/\D/g, ''));
                      }}
                    />
                  </label>
                )}
                <div className="fila fila-izquierda">
                  <button
                    type="button"
                    className="boton boton-peligro"
                    onClick={() => void anular()}
                  >
                    Confirmar anulación
                  </button>
                  <button
                    type="button"
                    className="boton"
                    onClick={() => {
                      setAnulando(false);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <p className="mensaje-aviso" role="status">
          {mensajeVenta}
        </p>
        {recordatorio && (
          <p className="accion-cajero" role="note">
            {recordatorio}
          </p>
        )}
      </div>
    </section>
  );
}
