import { formatearClp, parsearCantidad } from '@almacen/core';
import { useRef, useState } from 'react';
import { ErrorApi, type ClienteApi, type ProductoLocal, type ProductoSugerido } from '../api.js';
import { Modal } from '../componentes/Modal.js';

interface Props {
  api: ClienteApi;
  /** Código escaneado (puede ser `null` si se crea sin código). */
  codigo: string | null;
  /** Datos de la base de productos; `null` = producto que no está en ninguna base. */
  sugerido: ProductoSugerido | null;
  alCrear: (p: ProductoLocal) => void;
  alCerrar: () => void;
}

/**
 * Código desconocido en la venta. Si está en la base de productos, solo se pide precio y stock;
 * si no, también el nombre y si se vende por unidad o por kg.
 */
export function ModalAltaProducto({ api, codigo, sugerido, alCrear, alCerrar }: Props) {
  const [nombre, setNombre] = useState(sugerido?.name ?? '');
  const [unidad, setUnidad] = useState<'UN' | 'KG'>('UN');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campoPrecio = useRef<HTMLInputElement>(null);

  const guardar = async () => {
    if (guardando) return;
    const precioClp = Number(precio || '0');
    if (nombre.trim() === '') {
      setError('Escribe el nombre del producto');
      return;
    }
    if (precioClp <= 0) {
      setError('Escribe el precio de venta');
      return;
    }
    let stockMilli: number | undefined;
    if (stock.trim() !== '') {
      const s = parsearCantidad(stock, unidad);
      if (s === null) {
        setError(
          unidad === 'UN'
            ? 'El stock debe ser un número entero'
            : 'Escribe el stock en kg, por ejemplo 2,5',
        );
        return;
      }
      stockMilli = s;
    }
    setGuardando(true);
    try {
      const p = await api.crearProducto({
        barcode: codigo,
        name: nombre,
        brand: sugerido?.brand ?? null,
        format: sugerido?.format ?? null,
        unit: unidad,
        priceClp: precioClp,
        ...(stockMilli !== undefined ? { stockInicialMilli: stockMilli } : {}),
        categorySlug: sugerido?.categorySlug ?? null,
        seedRef: sugerido?.seedRef ?? null,
      });
      alCrear(p);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el producto');
    } finally {
      setGuardando(false);
    }
  };

  const alEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void guardar();
    }
  };

  return (
    <Modal
      titulo={sugerido ? 'Producto nuevo en tu almacén' : 'Producto desconocido'}
      alCerrar={alCerrar}
    >
      {sugerido ? (
        <div className="sugerido">
          <strong className="sugerido-nombre">{sugerido.name}</strong>
          <span className="suave">
            {[sugerido.brand, sugerido.format].filter(Boolean).join(' · ')}
            {codigo ? ` · ${codigo}` : ''}
          </span>
        </div>
      ) : (
        <>
          <p className="suave">
            {codigo
              ? `El código ${codigo} no está en la base de productos.`
              : 'Producto sin código.'}{' '}
            Escribe sus datos.
          </p>
          <label className="etiqueta-campo">
            Nombre
            <input
              className="campo"
              autoFocus
              maxLength={80}
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setError(null);
              }}
              onKeyDown={alEnter}
            />
          </label>
          <div className="selector-modo" role="group" aria-label="Se vende por">
            {(['UN', 'KG'] as const).map((u) => (
              <button
                key={u}
                type="button"
                className={unidad === u ? 'boton activo' : 'boton'}
                aria-pressed={unidad === u}
                onClick={() => {
                  setUnidad(u);
                  campoPrecio.current?.focus();
                }}
              >
                {u === 'UN' ? 'Por unidad' : 'Por kg'}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="etiqueta-campo">
        {unidad === 'KG' ? 'Precio por kg' : 'Precio de venta'}
        <input
          ref={campoPrecio}
          className="campo campo-monto"
          inputMode="numeric"
          autoFocus={sugerido !== null}
          placeholder="$0"
          value={precio === '' ? '' : formatearClp(Number(precio))}
          onChange={(e) => {
            setPrecio(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 8));
            setError(null);
          }}
          onKeyDown={alEnter}
        />
      </label>
      <label className="etiqueta-campo">
        Stock que hay ahora (opcional)
        <input
          className="campo"
          inputMode="decimal"
          placeholder={unidad === 'KG' ? 'ej. 2,5 kg' : 'ej. 12'}
          value={stock}
          onChange={(e) => {
            setStock(e.target.value.replace(/[^\d,.]/g, '').slice(0, 9));
            setError(null);
          }}
          onKeyDown={alEnter}
        />
      </label>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <button
        type="button"
        className="boton boton-cobrar"
        disabled={guardando}
        onClick={() => void guardar()}
      >
        {guardando ? 'Guardando…' : 'Guardar y agregar (Enter)'}
      </button>
    </Modal>
  );
}
