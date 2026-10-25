import {
  estimarCantidadPorMonto,
  formatearCantidad,
  formatearClp,
  parsearCantidad,
  calcularSubtotalLinea,
} from '@almacen/core';
import { useState } from 'react';
import { Modal } from '../componentes/Modal.js';
import { TecladoNumerico } from '../componentes/TecladoNumerico.js';
import { useTeclado } from '../useTeclado.js';
import { useValorRapido } from '../useValorRapido.js';

export type ResultadoPesoMonto =
  { tipo: 'PESO'; cantidadMilli: number } | { tipo: 'MONTO'; montoClp: number };

interface Props {
  nombre: string;
  precioPorKgClp: number;
  modoInicial?: 'PESO' | 'MONTO';
  alAceptar: (r: ResultadoPesoMonto) => void;
  alCerrar: () => void;
}

const MONTO_MAX_DIGITOS = 7;

/**
 * Producto por peso: el cajero ingresa los kg ("1,250") o el monto que pide el cliente
 * ("$1.000 de pan"). Tab cambia entre uno y otro.
 */
export function ModalPesoMonto({
  nombre,
  precioPorKgClp,
  modoInicial = 'PESO',
  alAceptar,
  alCerrar,
}: Props) {
  const [modo, setModo] = useState<'PESO' | 'MONTO'>(modoInicial);
  const { valor, cambiar, leer } = useValorRapido('');
  const [error, setError] = useState<string | null>(null);

  const cambiarModo = (m: 'PESO' | 'MONTO') => {
    setModo(m);
    cambiar(() => '');
    setError(null);
  };

  const agregar = (d: string) => {
    setError(null);
    cambiar((v) => {
      if (d === ',') {
        if (modo === 'MONTO' || v.includes(',')) return v;
        return v === '' ? '0,' : `${v},`;
      }
      if (modo === 'MONTO') return v.length < MONTO_MAX_DIGITOS ? (v === '0' ? d : v + d) : v;
      return v.length < 9 ? v + d : v;
    });
  };

  const aceptar = () => {
    const texto = leer();
    if (modo === 'PESO') {
      const milli = parsearCantidad(texto, 'KG');
      if (milli === null) {
        setError('Escribe el peso en kg, por ejemplo 1,250');
        return;
      }
      alAceptar({ tipo: 'PESO', cantidadMilli: milli });
      return;
    }
    const monto = Number(texto || '0');
    if (monto <= 0) {
      setError('Escribe el monto que pide el cliente');
      return;
    }
    alAceptar({ tipo: 'MONTO', montoClp: monto });
  };

  useTeclado((e) => {
    if (/^[0-9]$/.test(e.key)) agregar(e.key);
    else if (e.key === ',' || e.key === '.') agregar(',');
    else if (e.key === 'Backspace') cambiar((v) => v.slice(0, -1));
    else if (e.key === 'Tab') {
      e.preventDefault();
      cambiarModo(modo === 'PESO' ? 'MONTO' : 'PESO');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      aceptar();
    }
  });

  // Vista previa: cuánto cuesta ese peso, o cuánto pesa ese monto.
  let vista = '';
  if (modo === 'PESO') {
    const milli = parsearCantidad(valor, 'KG');
    if (milli !== null) vista = `= ${formatearClp(calcularSubtotalLinea(milli, precioPorKgClp))}`;
  } else if (Number(valor) > 0 && precioPorKgClp > 0) {
    vista = `≈ ${formatearCantidad(estimarCantidadPorMonto(Number(valor), precioPorKgClp), 'KG')}`;
  }

  return (
    <Modal titulo={nombre} alCerrar={alCerrar}>
      <p className="suave">{formatearClp(precioPorKgClp)} el kg</p>
      <div className="selector-modo" role="group" aria-label="Vender por">
        <button
          type="button"
          className={modo === 'PESO' ? 'boton activo' : 'boton'}
          aria-pressed={modo === 'PESO'}
          onClick={() => {
            cambiarModo('PESO');
          }}
        >
          Peso (kg)
        </button>
        <button
          type="button"
          className={modo === 'MONTO' ? 'boton activo' : 'boton'}
          aria-pressed={modo === 'MONTO'}
          onClick={() => {
            cambiarModo('MONTO');
          }}
        >
          Monto ($)
        </button>
      </div>
      <output className="monto-grande" aria-label={modo === 'PESO' ? 'Peso' : 'Monto'}>
        {valor === '' ? '—' : modo === 'PESO' ? `${valor} kg` : formatearClp(Number(valor))}
      </output>
      <p className="suave" aria-label="Equivale a">
        {vista}
      </p>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <TecladoNumerico
        alDigito={agregar}
        alBorrar={() => {
          cambiar((v) => v.slice(0, -1));
        }}
        alAceptar={aceptar}
        etiquetaAceptar="Agregar"
        conComa={modo === 'PESO'}
      />
    </Modal>
  );
}
