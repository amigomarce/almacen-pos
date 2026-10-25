import { formatearCantidad, formatearClp, margenPorcentaje, parsearCantidad } from '@almacen/core';
import { useEffect, useState } from 'react';
import { ErrorApi, type CambiosProducto, type ClienteApi, type ProductoDetalle } from '../api.js';
import { Modal } from '../componentes/Modal.js';

interface Props {
  api: ClienteApi;
  productoId: string;
  esDueno: boolean;
  alCambiar: () => void;
  alCerrar: () => void;
}

interface Formulario {
  name: string;
  brand: string;
  format: string;
  precio: string;
  costo: string;
  stockMin: string;
  barcode: string;
  scaleCode: string;
  taxType: 'AFECTO' | 'EXENTO';
  active: boolean;
}

const digitos = (v: string, max = 9) =>
  v
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, max);

function aFormulario(p: ProductoDetalle): Formulario {
  return {
    name: p.name,
    brand: p.brand ?? '',
    format: p.format ?? '',
    precio: String(p.priceClp),
    costo: p.costClp === null ? '' : String(p.costClp),
    stockMin:
      p.stockMinMilli === null ? '' : formatearCantidad(p.stockMinMilli, p.unit).replace(' kg', ''),
    barcode: p.barcode ?? '',
    scaleCode: p.scaleCode ?? '',
    taxType: p.taxType,
    active: p.active,
  };
}

/** Ficha del producto. El dueño edita precio, costo, stock y códigos; el cajero solo mira. */
export function ModalProducto({ api, productoId, esDueno, alCambiar, alCerrar }: Props) {
  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<{ tipo: 'CONTEO' | 'MERMA'; valor: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api
      .detalleProducto(productoId)
      .then((p) => {
        if (!vigente) return;
        setProducto(p);
        setForm(aFormulario(p));
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el producto');
      });
    return () => {
      vigente = false;
    };
  }, [api, productoId]);

  if (!producto || !form) {
    return (
      <Modal titulo="Producto" alCerrar={alCerrar}>
        {error ? (
          <p className="mensaje-error" role="alert">
            {error}
          </p>
        ) : (
          <p>Cargando…</p>
        )}
      </Modal>
    );
  }

  const cambiar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => {
    setForm({ ...form, [campo]: valor });
    setError(null);
    setAviso(null);
  };
  const kg = producto.unit === 'KG';
  const margen = margenPorcentaje(
    Number(form.precio || '0'),
    form.costo === '' ? null : Number(form.costo),
  );

  const guardar = async () => {
    const precio = Number(form.precio || '0');
    if (precio <= 0) {
      setError('El precio debe ser mayor a $0');
      return;
    }
    let stockMin: number | null = null;
    if (form.stockMin.trim() !== '') {
      stockMin = parsearCantidad(form.stockMin, producto.unit);
      if (stockMin === null) {
        setError(
          kg
            ? 'El stock mínimo va en kg, por ejemplo 2,5'
            : 'El stock mínimo debe ser un número entero',
        );
        return;
      }
    }
    if (form.name.trim() === '') {
      setError('El nombre no puede quedar vacío');
      return;
    }
    const original = aFormulario(producto);
    const cambios: CambiosProducto = {};
    if (form.name !== original.name) cambios.name = form.name;
    if (form.brand !== original.brand) cambios.brand = form.brand || null;
    if (form.format !== original.format) cambios.format = form.format || null;
    if (precio !== producto.priceClp) cambios.priceClp = precio;
    if (form.costo !== original.costo)
      cambios.costClp = form.costo === '' ? null : Number(form.costo);
    if (stockMin !== producto.stockMinMilli) cambios.stockMinMilli = stockMin;
    if (form.barcode !== original.barcode) cambios.barcode = form.barcode || null;
    if (form.scaleCode !== original.scaleCode) cambios.scaleCode = form.scaleCode || null;
    if (form.taxType !== original.taxType) cambios.taxType = form.taxType;
    if (form.active !== original.active) cambios.active = form.active;
    if (Object.keys(cambios).length === 0) {
      setAviso('No hay cambios que guardar.');
      return;
    }
    setGuardando(true);
    try {
      const p = await api.editarProducto(producto.id, cambios);
      setProducto(p);
      setForm(aFormulario(p));
      setAviso('Cambios guardados.');
      alCambiar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const aplicarAjuste = async () => {
    if (!ajuste) return;
    const cantidad = parsearCantidad(ajuste.valor, producto.unit);
    const valida = cantidad !== null || (ajuste.tipo === 'CONTEO' && ajuste.valor.trim() === '0');
    if (!valida) {
      setError(kg ? 'Escribe la cantidad en kg, por ejemplo 1,5' : 'Escribe una cantidad entera');
      return;
    }
    try {
      const p = await api.ajustarStock(
        producto.id,
        ajuste.tipo === 'CONTEO'
          ? { tipo: 'CONTEO', stockContadoMilli: cantidad ?? 0 }
          : { tipo: 'MERMA', cantidadMilli: cantidad ?? 0 },
      );
      setProducto(p);
      setAjuste(null);
      setAviso(`Stock actualizado: ${formatearCantidad(p.stockQtyMilli, p.unit)}`);
      alCambiar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo ajustar el stock');
    }
  };

  const campo = (
    etiqueta: string,
    nombre: keyof Formulario,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="etiqueta-campo">
      {etiqueta}
      <input
        className="campo"
        disabled={!esDueno}
        value={String(form[nombre])}
        onChange={(e) => {
          cambiar(nombre, e.target.value as never);
        }}
        {...props}
      />
    </label>
  );

  const stockBajo =
    producto.stockQtyMilli <= 0 ||
    (producto.stockMinMilli !== null && producto.stockQtyMilli <= producto.stockMinMilli);

  return (
    <Modal titulo={producto.name} alCerrar={alCerrar}>
      <p className="suave">
        {[
          producto.categoria ?? 'Sin categoría',
          producto.source === 'SEED' ? 'de la base de productos' : 'creado en el local',
        ]
          .filter(Boolean)
          .join(' · ')}
        {producto.barcodesAlternativos.length > 0
          ? ` · otros códigos: ${producto.barcodesAlternativos.join(', ')}`
          : ''}
      </p>

      <div className="stock-producto">
        <span>Stock</span>
        <output
          aria-label="Stock actual"
          className={stockBajo ? 'monto-medio negativo' : 'monto-medio'}
        >
          {formatearCantidad(producto.stockQtyMilli, producto.unit)}
        </output>
        {esDueno && !ajuste && (
          <span className="fila">
            <button
              type="button"
              className="boton"
              onClick={() => {
                setAjuste({ tipo: 'CONTEO', valor: '' });
              }}
            >
              Contar stock
            </button>
            <button
              type="button"
              className="boton"
              onClick={() => {
                setAjuste({ tipo: 'MERMA', valor: '' });
              }}
            >
              Merma
            </button>
          </span>
        )}
      </div>
      {ajuste && (
        <div className="fila">
          <label className="etiqueta-campo">
            {ajuste.tipo === 'CONTEO'
              ? `¿Cuánto hay en sala${kg ? ' (kg)' : ''}?`
              : `¿Cuánto se perdió${kg ? ' (kg)' : ''}?`}
            <input
              className="campo"
              autoFocus
              inputMode="decimal"
              value={ajuste.valor}
              onChange={(e) => {
                setAjuste({ ...ajuste, valor: e.target.value.replace(/[^\d,.]/g, '') });
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void aplicarAjuste();
              }}
            />
          </label>
          <button type="button" className="boton activo" onClick={() => void aplicarAjuste()}>
            Aplicar
          </button>
          <button
            type="button"
            className="boton"
            onClick={() => {
              setAjuste(null);
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {!esDueno && (
        <p className="suave">Solo el dueño puede cambiar precios, stock y datos del producto.</p>
      )}
      <div className="formulario">
        {campo('Nombre', 'name', { maxLength: 80 })}
        {campo('Marca', 'brand', { maxLength: 60 })}
        {campo('Formato', 'format', { maxLength: 40 })}
        <label className="etiqueta-campo">
          {kg ? 'Precio por kg' : 'Precio de venta'}
          <input
            className="campo campo-monto"
            disabled={!esDueno}
            inputMode="numeric"
            value={form.precio === '' ? '' : formatearClp(Number(form.precio))}
            onChange={(e) => {
              cambiar('precio', digitos(e.target.value, 8));
            }}
          />
        </label>
        <label className="etiqueta-campo">
          Costo {kg ? 'por kg' : 'unitario'} (opcional)
          <input
            className="campo"
            disabled={!esDueno}
            inputMode="numeric"
            value={form.costo === '' ? '' : formatearClp(Number(form.costo))}
            onChange={(e) => {
              cambiar('costo', digitos(e.target.value, 8));
            }}
          />
        </label>
        <p className="suave" aria-label="Margen">
          {margen === null ? 'Margen: sin costo' : `Margen: ${margen} %`}
        </p>
        {campo(kg ? 'Stock mínimo (kg)' : 'Stock mínimo', 'stockMin', { inputMode: 'decimal' })}
        {campo('Código de barras', 'barcode', { inputMode: 'numeric', maxLength: 14 })}
        {kg &&
          campo('Código de balanza (5 dígitos)', 'scaleCode', {
            inputMode: 'numeric',
            maxLength: 5,
          })}
        <label className="etiqueta-campo">
          Impuesto
          <select
            className="campo"
            disabled={!esDueno}
            value={form.taxType}
            onChange={(e) => {
              cambiar('taxType', e.target.value as 'AFECTO' | 'EXENTO');
            }}
          >
            <option value="AFECTO">Afecto a IVA</option>
            <option value="EXENTO">Exento de IVA</option>
          </select>
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            disabled={!esDueno}
            checked={form.active}
            onChange={(e) => {
              cambiar('active', e.target.checked);
            }}
          />
          Se vende (activo)
        </label>
      </div>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <p className="mensaje-aviso" role="status">
        {aviso}
      </p>
      {esDueno && (
        <button
          type="button"
          className="boton boton-cobrar"
          disabled={guardando}
          onClick={() => void guardar()}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </Modal>
  );
}
