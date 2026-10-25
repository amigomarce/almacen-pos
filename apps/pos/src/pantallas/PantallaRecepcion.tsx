import {
  formatearCantidad,
  formatearClp,
  parsearCantidad,
  calcularSubtotalLinea,
} from '@almacen/core';
import { useRef, useState } from 'react';
import {
  ErrorApi,
  type ClienteApi,
  type ProductoLocal,
  type ProductoSugerido,
  type ResultadoRecepcion,
} from '../api.js';
import { leerEntrada } from '../venta/entrada.js';
import { ModalAltaProducto } from '../venta/ModalAltaProducto.js';
import { ModalBuscar } from '../venta/ModalBuscar.js';

interface LineaRecibida {
  clave: string;
  producto: ProductoLocal;
  /** Texto de la cantidad tal como se escribe ("12", "2,5"). */
  cantidad: string;
  /** Costo unitario (o por kg) opcional, en dígitos. */
  costo: string;
}

type Ventana =
  | { tipo: 'BUSCAR'; texto: string }
  | { tipo: 'ALTA'; codigo: string | null; sugerido: ProductoSugerido | null }
  | null;

const digitos = (v: string) =>
  v
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 8);

/**
 * Recepción de mercadería: escanear lo que llegó, poner cantidad y (si se quiere) el costo.
 * Al guardar suma el stock y actualiza el costo promedio.
 */
export function PantallaRecepcion({ api }: { api: ClienteApi }) {
  const [lineas, setLineas] = useState<LineaRecibida[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'aviso'; texto: string } | null>(null);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{
    datos: ResultadoRecepcion;
    unidades: Record<string, 'UN' | 'KG'>;
  } | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const enfocar = () => {
    setTimeout(() => campo.current?.focus(), 0);
  };

  /** Escanear de nuevo suma 1 (por unidad); por kg agrega la línea para escribir el peso. */
  const agregar = (p: ProductoLocal, unidades = 1) => {
    setResultado(null);
    setMensaje(null);
    setLineas((ls) => {
      const existente = ls.find((l) => l.producto.id === p.id);
      if (existente && p.unit === 'UN') {
        const actual = parsearCantidad(existente.cantidad, 'UN') ?? 0;
        return ls.map((l) =>
          l.clave === existente.clave ? { ...l, cantidad: String(actual / 1000 + unidades) } : l,
        );
      }
      if (existente) return ls;
      return [
        ...ls,
        {
          clave: crypto.randomUUID(),
          producto: p,
          cantidad: p.unit === 'UN' ? String(unidades) : '',
          costo: '',
        },
      ];
    });
  };

  const procesar = async (texto: string) => {
    const entrada = leerEntrada(texto);
    if (entrada.tipo === 'VACIA') return;
    if (entrada.tipo === 'INVALIDA') {
      setMensaje({ tipo: 'error', texto: entrada.mensaje });
      return;
    }
    if (entrada.tipo === 'TEXTO') {
      setVentana({ tipo: 'BUSCAR', texto: entrada.texto });
      return;
    }
    try {
      const r = await api.buscarCodigo(entrada.codigo);
      if (r.origen === 'LOCAL') {
        if (r.balanza) {
          setMensaje({
            tipo: 'error',
            texto: 'Las etiquetas de balanza no se usan para recibir mercadería.',
          });
          return;
        }
        agregar(r.producto, entrada.multiplicador ?? 1);
      } else if (r.origen === 'NO_ENCONTRADO') {
        if (r.balanza) {
          setMensaje({
            tipo: 'error',
            texto: 'Las etiquetas de balanza no se usan para recibir mercadería.',
          });
          return;
        }
        setVentana({ tipo: 'ALTA', codigo: entrada.codigo, sugerido: null });
      } else {
        setVentana({ tipo: 'ALTA', codigo: entrada.codigo, sugerido: r.producto });
      }
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof ErrorApi ? e.message : 'No se pudo buscar el código',
      });
    }
  };

  const cambiarLinea = (clave: string, cambios: Partial<LineaRecibida>) => {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
    setMensaje(null);
  };

  const costoTotal = lineas.reduce((s, l) => {
    const q = parsearCantidad(l.cantidad, l.producto.unit);
    return q !== null && l.costo !== '' ? s + calcularSubtotalLinea(q, Number(l.costo)) : s;
  }, 0);

  const guardar = async () => {
    if (lineas.length === 0 || guardando) return;
    const pedido = [];
    for (const l of lineas) {
      const q = parsearCantidad(l.cantidad, l.producto.unit);
      if (q === null) {
        setMensaje({
          tipo: 'error',
          texto: `Revisa la cantidad de ${l.producto.name}${l.producto.unit === 'KG' ? ' (en kg, por ejemplo 2,5)' : ' (número entero)'}`,
        });
        return;
      }
      pedido.push({
        productoId: l.producto.id,
        cantidadMilli: q,
        ...(l.costo !== '' ? { costoUnitarioClp: Number(l.costo) } : {}),
      });
    }
    setGuardando(true);
    try {
      const r = await api.recibir(pedido);
      setResultado({
        datos: r,
        unidades: Object.fromEntries(lineas.map((l) => [l.producto.id, l.producto.unit])),
      });
      setLineas([]);
      setMensaje(null);
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof ErrorApi ? e.message : 'No se pudo guardar la recepción',
      });
    } finally {
      setGuardando(false);
      enfocar();
    }
  };

  return (
    <section className="pantalla-lista">
      <h2 className="titulo-seccion">Recibir mercadería</h2>
      <input
        ref={campo}
        className="campo campo-escaneo"
        aria-label="Escanea lo que llegó"
        placeholder="Escanea lo que llegó o escribe el nombre"
        autoFocus
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const valor = e.currentTarget.value;
            e.currentTarget.value = '';
            void procesar(valor);
          }
        }}
      />
      <p className={mensaje?.tipo === 'error' ? 'mensaje-error' : 'mensaje-aviso'} role="alert">
        {mensaje?.texto}
      </p>

      {resultado && (
        <div className="resultado-recepcion" role="status">
          <strong>Recepción guardada. Stock actualizado:</strong>
          <ul>
            {resultado.datos.lineas.map((l) => {
              const fmt = (m: number) =>
                formatearCantidad(m, resultado.unidades[l.productoId] ?? 'UN');
              return (
                <li key={`${l.productoId}-${l.stockNuevoMilli}`}>
                  {l.nombre}: {fmt(l.stockAnteriorMilli)} → {fmt(l.stockNuevoMilli)}
                  {l.costoNuevoClp !== null && l.costoNuevoClp !== l.costoAnteriorClp
                    ? ` · costo ${l.costoAnteriorClp === null ? 'nuevo' : formatearClp(l.costoAnteriorClp)} → ${formatearClp(l.costoNuevoClp)}`
                    : ''}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lineas.length === 0 ? (
        !resultado && <p className="venta-vacia">Escanea los productos que llegaron.</p>
      ) : (
        <>
          <table className="tabla" aria-label="Productos recibidos">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Costo (opcional)</th>
                <th className="numero">Stock actual</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.clave}>
                  <td>
                    <strong>{l.producto.name}</strong>
                  </td>
                  <td>
                    <input
                      className="campo campo-chico"
                      aria-label={`Cantidad de ${l.producto.name}`}
                      inputMode="decimal"
                      placeholder={l.producto.unit === 'KG' ? 'kg' : 'unidades'}
                      value={l.cantidad}
                      onChange={(e) => {
                        cambiarLinea(l.clave, {
                          cantidad: e.target.value.replace(/[^\d,.]/g, '').slice(0, 9),
                        });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="campo campo-chico"
                      aria-label={`Costo de ${l.producto.name}`}
                      inputMode="numeric"
                      placeholder={l.producto.unit === 'KG' ? '$ por kg' : '$ c/u'}
                      value={l.costo === '' ? '' : formatearClp(Number(l.costo))}
                      onChange={(e) => {
                        cambiarLinea(l.clave, { costo: digitos(e.target.value) });
                      }}
                    />
                  </td>
                  <td className="numero">
                    {formatearCantidad(l.producto.stockQtyMilli, l.producto.unit)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="boton boton-chico"
                      aria-label={`Quitar ${l.producto.name}`}
                      onClick={() => {
                        setLineas((ls) => ls.filter((x) => x.clave !== l.clave));
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fila fila-izquierda">
            {costoTotal > 0 && (
              <span className="suave">Costo total: {formatearClp(costoTotal)}</span>
            )}
          </div>
          <button
            type="button"
            className="boton boton-cobrar"
            disabled={guardando}
            onClick={() => void guardar()}
          >
            {guardando
              ? 'Guardando…'
              : `Guardar recepción (${lineas.length} ${lineas.length === 1 ? 'producto' : 'productos'})`}
          </button>
        </>
      )}

      {ventana?.tipo === 'BUSCAR' && (
        <ModalBuscar
          api={api}
          textoInicial={ventana.texto}
          alCerrar={() => {
            setVentana(null);
            enfocar();
          }}
          alElegir={(p) => {
            setVentana(null);
            agregar(p);
            enfocar();
          }}
        />
      )}
      {ventana?.tipo === 'ALTA' && (
        <ModalAltaProducto
          api={api}
          codigo={ventana.codigo}
          sugerido={ventana.sugerido}
          pedirStock={false}
          alCerrar={() => {
            setVentana(null);
            enfocar();
          }}
          alCrear={(p) => {
            setVentana(null);
            agregar(p);
            enfocar();
          }}
        />
      )}
    </section>
  );
}
