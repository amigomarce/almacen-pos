import { calcularCobro, formatearClp } from '@almacen/core';
import { useState } from 'react';
import type { MedioPago } from '../api.js';
import { Modal } from '../componentes/Modal.js';
import { TecladoNumerico } from '../componentes/TecladoNumerico.js';
import { useTeclado } from '../useTeclado.js';
import { useValorRapido } from '../useValorRapido.js';

const MEDIOS: { medio: MedioPago; etiqueta: string; tecla: string }[] = [
  { medio: 'EFECTIVO', etiqueta: 'Efectivo', tecla: 'E' },
  { medio: 'DEBITO', etiqueta: 'Débito', tecla: 'D' },
  { medio: 'CREDITO', etiqueta: 'Crédito', tecla: 'C' },
  { medio: 'TRANSFERENCIA', etiqueta: 'Transferencia', tecla: 'T' },
];

const BILLETES = [1000, 2000, 5000, 10000, 20000];
/** Un vuelto mayor que esto suele ser un cero de más: se pide confirmar. */
const VUELTO_SOSPECHOSO = 100_000;
const MAX_DIGITOS = 8;

interface Props {
  totalClp: number;
  redondeoHabilitado: boolean;
  enviando: boolean;
  error: string | null;
  alCobrar: (medioPago: MedioPago, pagadoClp: number) => void;
  alCerrar: () => void;
}

/**
 * Cobro (F12). En efectivo, Enter sin monto = pago exacto: escanear → F12 → Enter.
 * Con tarjeta o transferencia se confirma cuando el pago está aprobado.
 */
export function ModalCobro({
  totalClp,
  redondeoHabilitado,
  enviando,
  error,
  alCobrar,
  alCerrar,
}: Props) {
  const [medio, setMedio] = useState<MedioPago>('EFECTIVO');
  const { valor, cambiar, leer } = useValorRapido('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarVuelto, setConfirmarVuelto] = useState(false);

  const cobro = calcularCobro(totalClp, medio, redondeoHabilitado);
  const aPagar = cobro.totalACobrarClp;
  const pagaCon = valor === '' ? null : Number(valor);
  const vuelto = pagaCon === null ? 0 : pagaCon - aPagar;

  const cobrar = (montoDirecto?: number) => {
    if (enviando) return;
    if (medio !== 'EFECTIVO') {
      alCobrar(medio, aPagar);
      return;
    }
    // Se lee al instante: con teclas rápidas, el Enter puede llegar antes de redibujar.
    const texto = leer();
    const pagado = montoDirecto ?? (texto === '' ? aPagar : Number(texto));
    if (pagado < aPagar) {
      setAviso(`Falta dinero: el cliente debe pagar ${formatearClp(aPagar)}`);
      return;
    }
    if (pagado - aPagar > VUELTO_SOSPECHOSO && !confirmarVuelto) {
      setConfirmarVuelto(true);
      setAviso(
        `¿Seguro? El vuelto sería ${formatearClp(pagado - aPagar)}. Revisa el monto o presiona Enter otra vez.`,
      );
      return;
    }
    alCobrar('EFECTIVO', pagado);
  };

  const elegirMedio = (m: MedioPago) => {
    setMedio(m);
    setAviso(null);
    cambiar(() => '');
  };

  useTeclado((e) => {
    const letra = e.key.toUpperCase();
    const porTecla = MEDIOS.find((m) => m.tecla === letra);
    if (porTecla) {
      e.preventDefault();
      elegirMedio(porTecla.medio);
    } else if (medio === 'EFECTIVO' && /^[0-9]$/.test(e.key)) {
      setAviso(null);
      setConfirmarVuelto(false);
      cambiar((v) => (v.length < MAX_DIGITOS ? (v + e.key).replace(/^0+/, '') : v));
    } else if (e.key === 'Backspace') {
      setConfirmarVuelto(false);
      cambiar((v) => v.slice(0, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      cobrar();
    }
  });

  return (
    <Modal titulo="Cobrar" alCerrar={alCerrar}>
      <div className="cobro-total">
        <span className="suave">Total</span>
        <output aria-label="Total a pagar" className="monto-grande">
          {formatearClp(aPagar)}
        </output>
        {cobro.redondeoClp !== 0 && (
          <span className="suave">
            Venta {formatearClp(totalClp)} · redondeo efectivo {formatearClp(cobro.redondeoClp)}
          </span>
        )}
      </div>

      <div className="medios-pago" role="group" aria-label="Medio de pago">
        {MEDIOS.map((m) => (
          <button
            key={m.medio}
            type="button"
            className={m.medio === medio ? 'boton activo' : 'boton'}
            aria-pressed={m.medio === medio}
            onClick={() => {
              elegirMedio(m.medio);
            }}
          >
            {m.etiqueta} <span className="tecla-atajo">{m.tecla}</span>
          </button>
        ))}
      </div>

      {medio === 'EFECTIVO' ? (
        <>
          <div className="paga-con">
            <span>Paga con</span>
            <output aria-label="Paga con" className="monto-medio">
              {pagaCon === null ? 'Exacto' : formatearClp(pagaCon)}
            </output>
            <span>Vuelto</span>
            <output
              aria-label="Vuelto"
              className={vuelto < 0 ? 'monto-medio negativo' : 'monto-medio'}
            >
              {vuelto < 0 ? `Faltan ${formatearClp(-vuelto)}` : formatearClp(vuelto)}
            </output>
          </div>
          <div className="billetes" role="group" aria-label="Billetes">
            {BILLETES.filter((b) => b >= aPagar).map((b) => (
              <button
                key={b}
                type="button"
                className="boton"
                disabled={enviando}
                onClick={() => {
                  cambiar(() => String(b));
                  cobrar(b);
                }}
              >
                {formatearClp(b)}
              </button>
            ))}
          </div>
          <p className="mensaje-error" role="alert">
            {aviso ?? error}
          </p>
          <TecladoNumerico
            alDigito={(d) => {
              setAviso(null);
              cambiar((v) => (v.length < MAX_DIGITOS ? (v + d).replace(/^0+/, '') : v));
            }}
            alBorrar={() => {
              cambiar((v) => v.slice(0, -1));
            }}
            alAceptar={() => {
              cobrar();
            }}
            etiquetaAceptar={enviando ? 'Cobrando…' : 'Cobrar'}
            deshabilitado={enviando}
          />
        </>
      ) : (
        <>
          <p className="instruccion-pago">
            {medio === 'TRANSFERENCIA'
              ? `Confirma que llegó la transferencia de ${formatearClp(aPagar)}`
              : `Cobra ${formatearClp(aPagar)} en la máquina de tarjetas`}
          </p>
          <p className="mensaje-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="boton boton-cobrar"
            disabled={enviando}
            onClick={() => {
              cobrar();
            }}
          >
            {enviando ? 'Guardando…' : 'Pago aprobado (Enter)'}
          </button>
        </>
      )}
    </Modal>
  );
}
