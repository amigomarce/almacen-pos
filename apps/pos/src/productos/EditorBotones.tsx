import { formatearClp } from '@almacen/core';
import { useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type ProductoListado } from '../api.js';
import { Modal } from '../componentes/Modal.js';

interface BotonEditable {
  clave: string;
  label: string;
  productoId: string | null;
  detalle: string;
}

const MAX = 24;

/** El dueño elige qué botones de venta rápida aparecen en la venta y en qué orden. */
export function EditorBotones({ api, alCerrar }: { api: ClienteApi; alCerrar: () => void }) {
  const [botones, setBotones] = useState<BotonEditable[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ProductoListado[]>([]);
  const [libre, setLibre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    api
      .botonesRapidos()
      .then((b) => {
        setBotones(
          b.map((x) => ({
            clave: x.id,
            label: x.label,
            productoId: x.producto?.id ?? null,
            detalle: x.producto
              ? `${x.producto.name} · ${formatearClp(x.producto.priceClp)}`
              : 'monto libre',
          })),
        );
      })
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los botones');
      });
  }, [api]);

  useEffect(() => {
    if (busqueda.trim() === '') return;
    let vigente = true;
    const id = setTimeout(() => {
      api
        .listarProductos(busqueda, null)
        .then((r) => {
          if (vigente) setResultados(r.slice(0, 8));
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      vigente = false;
      clearTimeout(id);
    };
  }, [api, busqueda]);

  if (!botones) {
    return (
      <Modal titulo="Botones de venta rápida" alCerrar={alCerrar}>
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      </Modal>
    );
  }

  const agregar = (b: Omit<BotonEditable, 'clave'>) => {
    if (botones.length >= MAX) {
      setError(`Máximo ${MAX} botones`);
      return;
    }
    setBotones([...botones, { ...b, clave: crypto.randomUUID() }]);
    setAviso(null);
  };
  const mover = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= botones.length) return;
    const copia = [...botones];
    const a = copia[i];
    const b = copia[j];
    if (!a || !b) return;
    copia[i] = b;
    copia[j] = a;
    setBotones(copia);
  };

  const guardar = async () => {
    try {
      await api.guardarBotones(botones.map((b) => ({ label: b.label, productoId: b.productoId })));
      setAviso('Botones guardados.');
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron guardar');
    }
  };

  return (
    <Modal titulo="Botones de venta rápida" alCerrar={alCerrar}>
      <ol className="lista-botones" aria-label="Botones actuales">
        {botones.map((b, i) => (
          <li key={b.clave}>
            <span>
              <strong>{b.label}</strong> <span className="suave">{b.detalle}</span>
            </span>
            <span className="fila">
              <button
                type="button"
                className="boton boton-chico"
                aria-label={`Subir ${b.label}`}
                onClick={() => {
                  mover(i, -1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="boton boton-chico"
                aria-label={`Bajar ${b.label}`}
                onClick={() => {
                  mover(i, 1);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="boton boton-chico"
                aria-label={`Quitar ${b.label}`}
                onClick={() => {
                  setBotones(botones.filter((x) => x.clave !== b.clave));
                }}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      {botones.length === 0 && <p className="suave">Sin botones.</p>}

      <label className="etiqueta-campo">
        Agregar un producto
        <input
          className="campo"
          placeholder="Busca por nombre"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            if (e.target.value.trim() === '') setResultados([]);
          }}
        />
      </label>
      <ul className="resultados" aria-label="Productos para agregar">
        {resultados.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="resultado"
              onClick={() => {
                agregar({
                  label: p.name.slice(0, MAX),
                  productoId: p.id,
                  detalle: `${p.name} · ${formatearClp(p.priceClp)}`,
                });
                setBusqueda('');
                setResultados([]);
              }}
            >
              <span className="resultado-nombre">{p.name}</span>
              <span className="resultado-precio">
                {formatearClp(p.priceClp)}
                {p.unit === 'KG' ? '/kg' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="fila">
        <label className="etiqueta-campo">
          O un botón de monto libre
          <input
            className="campo"
            placeholder="ej. Bolsa, Recarga, Varios"
            maxLength={MAX}
            value={libre}
            onChange={(e) => {
              setLibre(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="boton"
          disabled={libre.trim() === ''}
          onClick={() => {
            agregar({ label: libre.trim(), productoId: null, detalle: 'monto libre' });
            setLibre('');
          }}
        >
          Agregar
        </button>
      </div>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <p className="mensaje-aviso" role="status">
        {aviso}
      </p>
      <button type="button" className="boton boton-cobrar" onClick={() => void guardar()}>
        Guardar botones
      </button>
    </Modal>
  );
}
