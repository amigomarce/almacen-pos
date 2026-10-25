import { formatearClp } from '@almacen/core';
import { useState } from 'react';
import { Modal } from '../componentes/Modal.js';
import { TecladoNumerico } from '../componentes/TecladoNumerico.js';

interface Props {
  nombreInicial: string;
  alAceptar: (nombre: string, montoClp: number) => void;
  alCerrar: () => void;
}

/** Venta sin producto: "Varios $1.500", "Bolsa $50". Afecta a IVA. */
export function ModalMontoLibre({ nombreInicial, alAceptar, alCerrar }: Props) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [digitos, setDigitos] = useState('');
  const [error, setError] = useState<string | null>(null);
  const monto = Number(digitos || '0');

  const aceptar = () => {
    if (monto <= 0) {
      setError('Escribe el monto');
      return;
    }
    alAceptar(nombre, monto);
  };

  return (
    <Modal titulo="Venta sin código" alCerrar={alCerrar}>
      <label className="etiqueta-campo">
        Qué se vende
        <input
          className="campo"
          value={nombre}
          maxLength={40}
          onChange={(e) => {
            setNombre(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              aceptar();
            }
          }}
        />
      </label>
      <label className="etiqueta-campo">
        Monto
        <input
          className="campo campo-monto"
          inputMode="numeric"
          autoFocus
          value={digitos === '' ? '' : formatearClp(monto)}
          placeholder="$0"
          onChange={(e) => {
            setError(null);
            setDigitos(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 7));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              aceptar();
            }
          }}
        />
      </label>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <TecladoNumerico
        alDigito={(d) => {
          setError(null);
          setDigitos((v) => (v.length < 7 ? (v + d).replace(/^0+/, '') : v));
        }}
        alBorrar={() => {
          setDigitos((v) => v.slice(0, -1));
        }}
        alAceptar={aceptar}
        etiquetaAceptar="Agregar"
      />
    </Modal>
  );
}
