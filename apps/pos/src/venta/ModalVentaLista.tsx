import { formatearClp } from '@almacen/core';
import { useEffect, useRef, useState } from 'react';
import {
  ErrorApi,
  type ClienteApi,
  type ResultadoImpresion,
  type VentaRegistrada,
} from '../api.js';
import { Modal } from '../componentes/Modal.js';
import { useTeclado } from '../useTeclado.js';

export type EstadoImpresion =
  | { tipo: 'IMPRIMIENDO' }
  | { tipo: 'LISTO'; resultado: ResultadoImpresion }
  | { tipo: 'ERROR'; mensaje: string; vistaPrevia: string | null };

const ESPERA_ENTER_MS = 700;

interface Props {
  api: ClienteApi;
  venta: VentaRegistrada;
  impresion: EstadoImpresion;
  alReimprimir: () => void;
  alActualizar: (v: VentaRegistrada) => void;
  alTerminar: () => void;
}

/**
 * Después de cobrar: vuelto en grande, estado de la impresión y, con la modalidad e-Boleta,
 * el aviso para emitirla y el folio opcional. Enter (o escanear el siguiente producto) sigue.
 */
export function ModalVentaLista({
  api,
  venta,
  impresion,
  alReimprimir,
  alActualizar,
  alTerminar,
}: Props) {
  const [folio, setFolio] = useState('');
  const [errorFolio, setErrorFolio] = useState<string | null>(null);
  const [verTicket, setVerTicket] = useState(false);
  const puente = venta.documento?.provider === 'PUENTE_MANUAL';
  // Un Enter repetido al cobrar no debe cerrar el vuelto antes de que el cajero lo vea.
  const campoFolio = useRef<HTMLInputElement>(null);
  const [aceptaEnter, setAceptaEnter] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setAceptaEnter(true);
    }, ESPERA_ENTER_MS);
    return () => {
      clearTimeout(id);
    };
  }, []);

  const guardarFolio = async () => {
    if (folio.trim() === '') return;
    try {
      alActualizar(await api.registrarFolioSii(venta.id, folio));
      setErrorFolio(null);
    } catch (e) {
      setErrorFolio(e instanceof ErrorApi ? e.message : 'No se pudo guardar el folio');
    }
  };

  useTeclado((e) => {
    // En el campo de folio, Enter guarda el folio (lo maneja el campo).
    if (e.key === 'Enter' && e.target !== campoFolio.current) {
      e.preventDefault();
      if (!aceptaEnter) return;
      alTerminar();
    }
  });

  const vistaPrevia =
    impresion.tipo === 'LISTO'
      ? impresion.resultado.vistaPrevia
      : impresion.tipo === 'ERROR'
        ? impresion.vistaPrevia
        : null;

  return (
    <Modal titulo={`Venta N° ${venta.numero}`} alCerrar={alTerminar}>
      {venta.medioPago === 'EFECTIVO' ? (
        <div className="vuelto">
          <span>Vuelto</span>
          <output aria-label="Vuelto" className="monto-gigante">
            {formatearClp(venta.vueltoClp)}
          </output>
          <span className="suave">
            Pagó {formatearClp(venta.pagadoClp)} · total {formatearClp(venta.totalCobradoClp)}
          </span>
        </div>
      ) : (
        <p className="monto-grande">{formatearClp(venta.totalCobradoClp)}</p>
      )}

      {venta.motivoSinDocumento === 'VOUCHER_ES_BOLETA' && (
        <p className="suave">La boleta es el voucher de la máquina de tarjetas.</p>
      )}

      {puente && (
        <div className="puente-sii">
          {venta.documento?.folioExterno ? (
            <p>
              Folio e-Boleta registrado: <strong>{venta.documento.folioExterno}</strong>
            </p>
          ) : (
            <>
              <p className="accion-cajero" role="note">
                {venta.documento?.accionCajero}
              </p>
              <label className="etiqueta-campo">
                Folio SII (opcional)
                <span className="fila">
                  <input
                    ref={campoFolio}
                    className="campo"
                    inputMode="numeric"
                    value={folio}
                    maxLength={10}
                    onChange={(e) => {
                      setFolio(e.target.value.replace(/\D/g, ''));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void guardarFolio();
                      }
                    }}
                  />
                  <button type="button" className="boton" onClick={() => void guardarFolio()}>
                    Guardar folio
                  </button>
                </span>
              </label>
              <p className="mensaje-error" role="alert">
                {errorFolio}
              </p>
            </>
          )}
        </div>
      )}

      <div className="estado-impresion" role="status">
        {impresion.tipo === 'IMPRIMIENDO' && 'Imprimiendo comprobante…'}
        {impresion.tipo === 'LISTO' &&
          (impresion.resultado.impreso ? 'Comprobante impreso.' : 'No hay impresora configurada.')}
        {impresion.tipo === 'ERROR' && <span className="mensaje-error">{impresion.mensaje}</span>}
      </div>
      <div className="fila">
        {impresion.tipo !== 'IMPRIMIENDO' && (
          <button type="button" className="boton" onClick={alReimprimir}>
            Imprimir de nuevo
          </button>
        )}
        {vistaPrevia && (
          <button
            type="button"
            className="boton"
            onClick={() => {
              setVerTicket((v) => !v);
            }}
          >
            {verTicket ? 'Ocultar comprobante' : 'Ver comprobante'}
          </button>
        )}
      </div>
      {verTicket && vistaPrevia && (
        <pre className="ticket" aria-label="Comprobante">
          {vistaPrevia}
        </pre>
      )}

      <button type="button" className="boton boton-cobrar" onClick={alTerminar}>
        Nueva venta (Enter)
      </button>
    </Modal>
  );
}
