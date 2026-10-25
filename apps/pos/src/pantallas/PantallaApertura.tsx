import { formatearClp } from '@almacen/core';
import { useState } from 'react';
import { ErrorApi, type ClienteApi, type EstadoCaja } from '../api.js';
import { TecladoNumerico } from '../componentes/TecladoNumerico.js';
import { useTeclado } from '../useTeclado.js';
import { useValorRapido } from '../useValorRapido.js';

const MAX_DIGITOS = 9;

interface Props {
  api: ClienteApi;
  caja: string;
  alAbrir: (estado: EstadoCaja) => void;
}

export function PantallaApertura({ api, caja, alAbrir }: Props) {
  const { valor: digitos, cambiar: cambiarDigitos, leer: leerDigitos } = useValorRapido();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const monto = Number(digitos || '0');

  const agregar = (d: string) => {
    setError(null);
    cambiarDigitos((v) => (v.length < MAX_DIGITOS ? (v === '0' ? d : v + d) : v));
  };
  const borrar = () => {
    cambiarDigitos((v) => v.slice(0, -1));
  };
  const abrir = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      alAbrir(await api.abrirCaja(Number(leerDigitos() || '0')));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo abrir la caja');
    } finally {
      setEnviando(false);
    }
  };

  useTeclado((e) => {
    if (/^[0-9]$/.test(e.key)) agregar(e.key);
    else if (e.key === 'Backspace') borrar();
    else if (e.key === 'Enter') void abrir();
  });

  return (
    <section className="pantalla-centrada">
      <h2>Abrir {caja}</h2>
      <p>¿Con cuánto efectivo parte la caja?</p>
      <output className="monto-grande" aria-label="Efectivo inicial">
        {formatearClp(monto)}
      </output>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <TecladoNumerico
        alDigito={agregar}
        alBorrar={borrar}
        alAceptar={() => void abrir()}
        etiquetaAceptar="Abrir caja"
        deshabilitado={enviando}
      />
    </section>
  );
}
