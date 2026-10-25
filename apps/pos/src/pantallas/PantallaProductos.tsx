import { formatearCantidad, formatearClp, normalizarCodigoBarras } from '@almacen/core';
import { useCallback, useEffect, useState } from 'react';
import {
  ErrorApi,
  type ClienteApi,
  type FiltroProductos,
  type ProductoListado,
  type ProductoSugerido,
} from '../api.js';
import { EditorBotones } from '../productos/EditorBotones.js';
import { ModalProducto } from '../productos/ModalProducto.js';
import { leerEntrada } from '../venta/entrada.js';
import { ModalAltaProducto } from '../venta/ModalAltaProducto.js';

const FILTROS: { filtro: FiltroProductos | null; etiqueta: string }[] = [
  { filtro: null, etiqueta: 'Todos' },
  { filtro: 'STOCK_BAJO', etiqueta: 'Stock bajo' },
  { filtro: 'SIN_STOCK', etiqueta: 'Sin stock' },
  { filtro: 'SIN_CATEGORIA', etiqueta: 'Sin categoría' },
  { filtro: 'INACTIVOS', etiqueta: 'Inactivos' },
];

type Ventana =
  | { tipo: 'PRODUCTO'; id: string }
  | { tipo: 'ALTA'; codigo: string | null; sugerido: ProductoSugerido | null }
  | { tipo: 'BOTONES' }
  | null;

/** Buscar productos (o escanearlos), ver stock bajo y editar. */
export function PantallaProductos({ api, esDueno }: { api: ClienteApi; esDueno: boolean }) {
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<FiltroProductos | null>(null);
  const [lista, setLista] = useState<ProductoListado[] | null>(null);
  const [buscado, setBuscado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    if (texto.trim() === '' && !filtro) return;
    let vigente = true;
    const id = setTimeout(() => {
      api
        .listarProductos(texto, filtro)
        .then((r) => {
          if (!vigente) return;
          setLista(r);
          setBuscado(texto);
          setError(null);
        })
        .catch((e: unknown) => {
          if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar');
        });
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(id);
    };
  }, [api, texto, filtro, recargar]);

  const refrescar = useCallback(() => {
    setRecargar((n) => n + 1);
  }, []);

  /** Enter con un código escaneado: abre el producto, o su alta si no está en el local. */
  const alEnter = async () => {
    const entrada = leerEntrada(texto);
    if (entrada.tipo !== 'CODIGO') return;
    const codigo = entrada.codigo;
    try {
      const r = await api.buscarCodigo(codigo);
      if (r.origen === 'LOCAL') setVentana({ tipo: 'PRODUCTO', id: r.producto.id });
      else if (r.origen === 'NO_ENCONTRADO') {
        if (r.balanza) setError('Ese código es de una etiqueta de balanza');
        else setVentana({ tipo: 'ALTA', codigo, sugerido: null });
      } else setVentana({ tipo: 'ALTA', codigo, sugerido: r.producto });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar el código');
    }
  };

  const mostrar = texto.trim() !== '' || filtro !== null;

  return (
    <section className="pantalla-lista">
      <div className="fila fila-izquierda">
        <input
          className="campo campo-escaneo"
          aria-label="Buscar producto"
          placeholder="Busca por nombre o escanea un código"
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
            if (e.target.value.trim() === '' && !filtro) setLista(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void alEnter();
            }
          }}
        />
        <button
          type="button"
          className="boton"
          onClick={() => {
            setVentana({ tipo: 'ALTA', codigo: null, sugerido: null });
          }}
        >
          Nuevo sin código
        </button>
        {esDueno && (
          <button
            type="button"
            className="boton"
            onClick={() => {
              setVentana({ tipo: 'BOTONES' });
            }}
          >
            Botones de venta rápida
          </button>
        )}
      </div>
      <div className="fila fila-izquierda" role="group" aria-label="Filtro">
        {FILTROS.map((f) => (
          <button
            key={f.etiqueta}
            type="button"
            className={filtro === f.filtro ? 'boton boton-chico activo' : 'boton boton-chico'}
            aria-pressed={filtro === f.filtro}
            onClick={() => {
              setFiltro(f.filtro);
              if (!f.filtro && texto.trim() === '') setLista(null);
            }}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>
      <p className="mensaje-error" role="alert">
        {error}
      </p>

      {!mostrar || !lista ? (
        <p className="venta-vacia">Busca un producto por nombre, escanéalo o elige un filtro.</p>
      ) : lista.length === 0 ? (
        <div className="venta-vacia">
          <p>Sin resultados.</p>
          {buscado !== null && normalizarCodigoBarras(buscado) && (
            <button type="button" className="boton" onClick={() => void alEnter()}>
              Dar de alta el código {buscado.trim()}
            </button>
          )}
        </div>
      ) : (
        <table className="tabla" aria-label="Productos">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Código</th>
              <th className="numero">Precio</th>
              <th className="numero">Stock</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const bajo =
                p.stockQtyMilli <= 0 ||
                (p.stockMinMilli !== null && p.stockQtyMilli <= p.stockMinMilli);
              return (
                <tr
                  key={p.id}
                  tabIndex={0}
                  className="fila-tabla"
                  onClick={() => {
                    setVentana({ tipo: 'PRODUCTO', id: p.id });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setVentana({ tipo: 'PRODUCTO', id: p.id });
                  }}
                >
                  <td>
                    <strong>{p.name}</strong>
                    {(p.brand ?? p.format) && (
                      <span className="suave">
                        {' '}
                        · {[p.brand, p.format].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="suave">{p.barcode ?? '—'}</td>
                  <td className="numero">
                    {formatearClp(p.priceClp)}
                    {p.unit === 'KG' ? '/kg' : ''}
                  </td>
                  <td className={bajo ? 'numero negativo' : 'numero'}>
                    {formatearCantidad(p.stockQtyMilli, p.unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {ventana?.tipo === 'PRODUCTO' && (
        <ModalProducto
          api={api}
          productoId={ventana.id}
          esDueno={esDueno}
          alCambiar={refrescar}
          alCerrar={() => {
            setVentana(null);
          }}
        />
      )}
      {ventana?.tipo === 'ALTA' && (
        <ModalAltaProducto
          api={api}
          codigo={ventana.codigo}
          sugerido={ventana.sugerido}
          alCerrar={() => {
            setVentana(null);
          }}
          alCrear={(p) => {
            setVentana({ tipo: 'PRODUCTO', id: p.id });
            setTexto(p.name);
            refrescar();
          }}
        />
      )}
      {ventana?.tipo === 'BOTONES' && (
        <EditorBotones
          api={api}
          alCerrar={() => {
            setVentana(null);
          }}
        />
      )}
    </section>
  );
}
