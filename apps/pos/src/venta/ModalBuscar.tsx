import { formatearCantidad, formatearClp } from '@almacen/core';
import { useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type ProductoLocal } from '../api.js';
import { Modal } from '../componentes/Modal.js';

interface Props {
  api: ClienteApi;
  textoInicial: string;
  alElegir: (p: ProductoLocal) => void;
  alCerrar: () => void;
}

const ESPERA_MS = 150;

/** F2: buscar un producto por nombre, marca o código. */
export function ModalBuscar({ api, textoInicial, alElegir, alCerrar }: Props) {
  const [texto, setTexto] = useState(textoInicial);
  const [resultados, setResultados] = useState<ProductoLocal[]>([]);
  /** Texto al que corresponden los resultados que se muestran. */
  const [buscado, setBuscado] = useState('');
  const [elegido, setElegido] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const id = setTimeout(() => {
      if (texto.trim() === '') {
        setResultados([]);
        setBuscado(texto);
        return;
      }
      api
        .buscarProductos(texto)
        .then((r) => {
          if (!vigente) return;
          setResultados(r);
          setBuscado(texto);
          setElegido(0);
          setError(null);
        })
        .catch((e: unknown) => {
          if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar');
        });
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(id);
    };
  }, [api, texto]);

  const elegir = (i: number) => {
    const p = resultados[i];
    if (p) alElegir(p);
  };

  /** Enter antes de que lleguen los resultados: busca ya y elige el primero. */
  const aceptar = async () => {
    if (buscado === texto) {
      elegir(elegido);
      return;
    }
    if (texto.trim() === '') return;
    try {
      const r = await api.buscarProductos(texto);
      const primero = r[0];
      if (primero) alElegir(primero);
      else {
        setResultados([]);
        setBuscado(texto);
      }
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar');
    }
  };

  return (
    <Modal titulo="Buscar producto" alCerrar={alCerrar}>
      <input
        className="campo"
        aria-label="Nombre, marca o código"
        placeholder="Nombre, marca o código"
        autoFocus
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setElegido((i) => Math.min(resultados.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setElegido((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void aceptar();
          }
        }}
      />
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <ul className="resultados" aria-label="Resultados">
        {resultados.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className={i === elegido ? 'resultado elegido' : 'resultado'}
              onClick={() => {
                elegir(i);
              }}
            >
              <span className="resultado-nombre">
                {p.name}
                {p.brand ? <span className="suave"> · {p.brand}</span> : null}
              </span>
              <span className="resultado-precio">
                {formatearClp(p.priceClp)}
                {p.unit === 'KG' ? '/kg' : ''}
              </span>
              <span className="suave">Stock {formatearCantidad(p.stockQtyMilli, p.unit)}</span>
            </button>
          </li>
        ))}
      </ul>
      {texto.trim() !== '' && resultados.length === 0 && !error && (
        <p className="suave">Sin resultados</p>
      )}
    </Modal>
  );
}
