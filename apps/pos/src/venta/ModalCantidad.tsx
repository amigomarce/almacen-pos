import { formatearCantidad, parsearCantidad } from '@almacen/core';
import { useState } from 'react';
import { Modal } from '../componentes/Modal.js';
import { TecladoNumerico } from '../componentes/TecladoNumerico.js';
import { useTeclado } from '../useTeclado.js';
import { useValorRapido } from '../useValorRapido.js';
import type { LineaCarrito } from './carrito.js';

interface Props {
  linea: LineaCarrito;
  alAceptar: (cantidadMilli: number) => void;
  alCerrar: () => void;
}

/** F4: cantidad de la línea seleccionada (unidades o kg con coma). */
export function ModalCantidad({ linea, alAceptar, alCerrar }: Props) {
  const kg = linea.unidad === 'KG';
  const { valor, cambiar, leer } = useValorRapido('');
  const [error, setError] = useState<string | null>(null);

  const agregar = (d: string) => {
    setError(null);
    cambiar((v) => {
      if (d === ',') return kg && !v.includes(',') ? (v === '' ? '0,' : `${v},`) : v;
      return v.length < 9 ? v + d : v;
    });
  };
  const aceptar = () => {
    const milli = parsearCantidad(leer(), linea.unidad);
    if (milli === null) {
      setError(
        kg ? 'Escribe el peso en kg, por ejemplo 1,250' : 'Escribe una cantidad entera mayor a 0',
      );
      return;
    }
    alAceptar(milli);
  };

  useTeclado((e) => {
    if (/^[0-9]$/.test(e.key)) agregar(e.key);
    else if (e.key === ',' || e.key === '.') agregar(',');
    else if (e.key === 'Backspace') cambiar((v) => v.slice(0, -1));
    else if (e.key === 'Enter') {
      e.preventDefault();
      aceptar();
    }
  });

  return (
    <Modal titulo={kg ? 'Peso (kg)' : 'Cantidad'} alCerrar={alCerrar}>
      <p>
        {linea.nombre} · ahora {formatearCantidad(linea.cantidadMilli, linea.unidad)}
      </p>
      <output className="monto-grande" aria-label="Nueva cantidad">
        {valor === '' ? '—' : `${valor}${kg ? ' kg' : ''}`}
      </output>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <TecladoNumerico
        alDigito={agregar}
        alBorrar={() => {
          cambiar((v) => v.slice(0, -1));
        }}
        alAceptar={aceptar}
        etiquetaAceptar="Aceptar"
        conComa={kg}
      />
    </Modal>
  );
}
