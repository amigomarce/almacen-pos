import { formatearClp } from '@almacen/core';
import { useEffect, useState } from 'react';
import { ErrorApi, type Cliente, type ClienteApi } from '../api.js';

const MAX_RESULTADOS = 6;

/** Con este vecino y este total, ¿hace falta la clave del dueño? */
export function excedeLimite(cliente: Cliente, totalClp: number): boolean {
  return cliente.limiteClp !== null && cliente.saldoClp + totalClp > cliente.limiteClp;
}

/**
 * Cobro → Fiado: elegir a qué vecino se le carga la venta (ADR-022). Muestra lo que debe y,
 * si con esta venta pasa su límite, pide la clave del dueño.
 */
export function SelectorFiado({
  api,
  totalClp,
  elegido,
  pin,
  alElegir,
  alCambiarPin,
}: {
  api: ClienteApi;
  totalClp: number;
  elegido: Cliente | null;
  pin: string;
  alElegir: (c: Cliente | null) => void;
  alCambiarPin: (pin: string) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api
      .clientes()
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
  }, [api]);

  if (error) {
    return (
      <p className="mensaje-error" role="alert">
        {error}
      </p>
    );
  }
  if (!clientes) return <p className="suave">Cargando vecinos…</p>;
  if (clientes.length === 0) {
    return (
      <p className="instruccion-pago">
        No hay vecinos con cuenta. El dueño los crea en la pestaña Fiado.
      </p>
    );
  }

  if (elegido) {
    const quedara = elegido.saldoClp + totalClp;
    const pideClave = excedeLimite(elegido, totalClp);
    return (
      <div className="fiado-elegido">
        <p className="instruccion-pago">
          A cuenta de <strong>{elegido.nombre}</strong>
        </p>
        <p>
          Debe {formatearClp(elegido.saldoClp)} → quedará debiendo{' '}
          <strong>{formatearClp(quedara)}</strong>
          {elegido.limiteClp !== null && (
            <span className="suave"> (límite {formatearClp(elegido.limiteClp)})</span>
          )}
        </p>
        {pideClave && (
          <label className="etiqueta-campo">
            Pasa su límite: clave del dueño
            <input
              className="campo"
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(e) => {
                alCambiarPin(e.target.value.replace(/\D/g, ''));
              }}
            />
          </label>
        )}
        <button
          type="button"
          className="boton boton-texto"
          onClick={() => {
            alElegir(null);
          }}
        >
          Cambiar vecino
        </button>
      </div>
    );
  }

  const filtro = texto.trim().toLowerCase();
  const resultados = clientes
    .filter((c) => c.nombre.toLowerCase().includes(filtro))
    .slice(0, MAX_RESULTADOS);

  return (
    <div className="fiado-buscar">
      <input
        className="campo"
        aria-label="Buscar vecino"
        placeholder="Nombre del vecino"
        autoFocus
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
        }}
        onKeyDown={(e) => {
          const [primero] = resultados;
          if (e.key === 'Enter' && primero) {
            e.preventDefault();
            e.stopPropagation();
            alElegir(primero);
          }
        }}
      />
      <ul className="lista-vecinos" aria-label="Vecinos">
        {resultados.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="boton boton-espera"
              onClick={() => {
                alElegir(c);
              }}
            >
              <strong>{c.nombre}</strong>
              <span className="suave">
                Debe {formatearClp(c.saldoClp)}
                {c.limiteClp !== null && ` · límite ${formatearClp(c.limiteClp)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
