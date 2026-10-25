import { formatearCantidad, formatearClp, MILI } from '@almacen/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi, type ClienteApi, type Cotizacion, type ProductoLocal } from '../api.js';
import { useTeclado } from '../useTeclado.js';
import {
  agregarProducto,
  cambiarCantidad,
  CARRITO_VACIO,
  contarArticulos,
  lineaSeleccionada,
  moverSeleccion,
  quitarLinea,
  sumarUnidades,
  totalLocal,
  type Carrito,
} from '../venta/carrito.js';
import { DetectorEscaneo } from '../venta/detector.js';
import { leerEntrada } from '../venta/entrada.js';
import { ModalBuscar } from '../venta/ModalBuscar.js';
import { ModalCantidad } from '../venta/ModalCantidad.js';

type Mensaje = { tipo: 'error' | 'aviso'; texto: string } | null;
type Ventana = { tipo: 'BUSCAR'; texto: string } | { tipo: 'CANTIDAD' } | null;

/** Esc dos veces dentro de este tiempo cancela la venta (sin ventana de confirmación). */
const ESPERA_CANCELAR_MS = 3000;

const nuevaClave = () => crypto.randomUUID();

interface Props {
  api: ClienteApi;
}

export function PantallaVenta({ api }: Props) {
  const [carrito, setCarrito] = useState<Carrito>(CARRITO_VACIO);
  const [cotizacion, setCotizacion] = useState<{ carrito: Carrito; datos: Cotizacion } | null>(
    null,
  );
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const detector = useRef(new DetectorEscaneo());

  // Foco permanente en el campo de escaneo (el lector "tipea" ahí).
  const enfocar = useCallback(() => {
    setTimeout(() => campo.current?.focus(), 0);
  }, []);

  // Cotiza en el servidor cada vez que cambia el carrito: precios vigentes y promociones.
  useEffect(() => {
    if (carrito.lineas.length === 0) return;
    let vigente = true;
    api
      .cotizar(
        carrito.lineas.map((l) => ({ productoId: l.productoId, cantidadMilli: l.cantidadMilli })),
      )
      .then((datos) => {
        if (vigente) setCotizacion({ carrito, datos });
      })
      .catch((e: unknown) => {
        if (vigente && e instanceof ErrorApi && e.estado !== 0)
          setMensaje({ tipo: 'error', texto: e.message });
      });
    return () => {
      vigente = false;
    };
  }, [api, carrito]);

  const actualizada = cotizacion?.carrito === carrito ? cotizacion.datos : null;
  const total = carrito.lineas.length === 0 ? 0 : (actualizada?.totalClp ?? totalLocal(carrito));

  const agregar = useCallback((p: ProductoLocal, cantidadMilli: number) => {
    setCarrito((c) =>
      agregarProducto(
        c,
        { productoId: p.id, nombre: p.name, unidad: p.unit, precioUnitarioClp: p.priceClp },
        cantidadMilli,
        nuevaClave(),
      ),
    );
    setConfirmarCancelar(false);
    setMensaje(
      p.stockQtyMilli - cantidadMilli <= 0
        ? { tipo: 'aviso', texto: `Stock en 0 o negativo: ${p.name}. Revisa el inventario.` }
        : null,
    );
  }, []);

  const procesarCodigo = useCallback(
    async (codigo: string, multiplicador: number | null) => {
      try {
        const r = await api.buscarCodigo(codigo);
        if (r.origen === 'LOCAL') {
          const p = r.producto;
          if (r.balanza?.tipo === 'PRECIO') {
            setMensaje({
              tipo: 'aviso',
              texto: 'Las etiquetas de balanza con precio todavía no se pueden vender.',
            });
            return;
          }
          if (r.balanza?.tipo === 'PESO') {
            if (p.unit !== 'KG') {
              setMensaje({
                tipo: 'error',
                texto: `${p.name} está configurado por unidad, no por peso.`,
              });
              return;
            }
            agregar(p, r.balanza.pesoGramos);
            return;
          }
          if (p.unit === 'KG') {
            // Producto por peso con código normal: se agrega 1 kg y se pide el peso.
            agregar(p, MILI);
            setVentana({ tipo: 'CANTIDAD' });
            return;
          }
          agregar(p, (multiplicador ?? 1) * MILI);
          return;
        }
        if (r.origen === 'NO_ENCONTRADO') {
          setMensaje({ tipo: 'error', texto: `El código ${codigo} no está registrado.` });
          return;
        }
        setMensaje({
          tipo: 'aviso',
          texto: `"${r.producto.name}" todavía no está en tus productos.`,
        });
      } catch (e) {
        setMensaje({
          tipo: 'error',
          texto: e instanceof ErrorApi ? e.message : 'No se pudo buscar el código',
        });
      }
    },
    [api, agregar],
  );

  const alEnter = () => {
    const input = campo.current;
    if (!input || ventana) return;
    // Se lee del DOM (no de un estado): con el lector, el Enter llega antes de redibujar.
    const entrada = leerEntrada(input.value);
    input.value = '';
    switch (entrada.tipo) {
      case 'VACIA':
        return;
      case 'INVALIDA':
        setMensaje({ tipo: 'error', texto: entrada.mensaje });
        return;
      case 'TEXTO':
        setVentana({ tipo: 'BUSCAR', texto: entrada.texto });
        return;
      case 'CODIGO':
        void procesarCodigo(entrada.codigo, entrada.multiplicador);
    }
  };

  const cerrarVentana = () => {
    setVentana(null);
    enfocar();
  };

  const cancelarVenta = () => {
    setCarrito(CARRITO_VACIO);
    setCotizacion(null);
    setConfirmarCancelar(false);
    setMensaje({ tipo: 'aviso', texto: 'Venta cancelada.' });
  };

  useEffect(() => {
    if (!confirmarCancelar) return;
    const id = setTimeout(() => {
      setConfirmarCancelar(false);
    }, ESPERA_CANCELAR_MS);
    return () => {
      clearTimeout(id);
    };
  }, [confirmarCancelar]);

  const seleccionada = lineaSeleccionada(carrito);

  useTeclado((e) => {
    // Con una ventana abierta, un escaneo igual se reconoce: cierra la ventana y lo agrega.
    if (ventana) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cerrarVentana();
        return;
      }
      const codigo = detector.current.tecla(e.key, e.timeStamp);
      if (codigo) {
        e.preventDefault();
        cerrarVentana();
        const entrada = leerEntrada(codigo);
        if (entrada.tipo === 'CODIGO') void procesarCodigo(entrada.codigo, null);
      }
      return;
    }
    const vacio = (campo.current?.value ?? '') === '';
    switch (e.key) {
      case 'F2':
        e.preventDefault();
        setVentana({ tipo: 'BUSCAR', texto: campo.current?.value ?? '' });
        if (campo.current) campo.current.value = '';
        return;
      case 'F4':
        e.preventDefault();
        if (seleccionada) setVentana({ tipo: 'CANTIDAD' });
        return;
      case 'Escape':
        e.preventDefault();
        if (!vacio && campo.current) {
          campo.current.value = '';
          return;
        }
        if (carrito.lineas.length === 0) return;
        if (confirmarCancelar) cancelarVenta();
        else setConfirmarCancelar(true);
        return;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        setCarrito((c) => moverSeleccion(c, e.key === 'ArrowUp' ? -1 : 1));
        return;
      case 'Delete':
        if (vacio && seleccionada) {
          e.preventDefault();
          setCarrito((c) => quitarLinea(c, seleccionada.clave));
        }
        return;
      case '+':
      case '-':
        if (vacio && seleccionada) {
          e.preventDefault();
          setCarrito((c) => sumarUnidades(c, seleccionada.clave, e.key === '+' ? 1 : -1));
        }
        return;
    }
  });

  return (
    <section className="venta">
      <div className="venta-izquierda">
        <input
          ref={campo}
          className="campo campo-escaneo"
          aria-label="Escanea o escribe un código"
          placeholder="Escanea o escribe un código · F2 buscar"
          autoFocus
          autoComplete="off"
          readOnly={ventana !== null}
          onBlur={() => {
            if (!ventana) enfocar();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              alEnter();
            }
          }}
        />
        <p className={mensaje?.tipo === 'error' ? 'mensaje-error' : 'mensaje-aviso'} role="alert">
          {confirmarCancelar ? 'Presiona Esc otra vez para cancelar la venta' : mensaje?.texto}
        </p>
        {carrito.lineas.length === 0 ? (
          <p className="venta-vacia">Escanea un producto para empezar</p>
        ) : (
          <ul className="lineas" aria-label="Productos de la venta">
            {carrito.lineas.map((l, i) => {
              const cot = actualizada?.lineas[i];
              const totalLinea = cot
                ? cot.totalLineaClp
                : Math.round((l.cantidadMilli * l.precioUnitarioClp) / MILI);
              return (
                <li key={l.clave} aria-selected={l.clave === carrito.seleccionada}>
                  <button
                    type="button"
                    className={l.clave === carrito.seleccionada ? 'linea seleccionada' : 'linea'}
                    onClick={() => {
                      setCarrito((c) => ({ ...c, seleccionada: l.clave }));
                    }}
                  >
                    <span className="linea-nombre">{l.nombre}</span>
                    <span className="linea-detalle">
                      {formatearCantidad(l.cantidadMilli, l.unidad)} x{' '}
                      {formatearClp(cot?.precioUnitarioClp ?? l.precioUnitarioClp)}
                      {l.unidad === 'KG' ? '/kg' : ''}
                      {cot && cot.descuentoClp > 0
                        ? ` · promoción ${formatearClp(-cot.descuentoClp)}`
                        : ''}
                    </span>
                    <span className="linea-total">{formatearClp(totalLinea)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="venta-derecha">
        <div className="total" aria-label="Total">
          <span className="total-etiqueta">TOTAL</span>
          <span className="total-monto">{formatearClp(total)}</span>
          <span className="suave">
            {contarArticulos(carrito)} {contarArticulos(carrito) === 1 ? 'artículo' : 'artículos'}
          </span>
        </div>
        <button
          type="button"
          className="boton boton-cobrar"
          disabled
          title="El cobro llega en el siguiente paso"
        >
          Cobrar (F12)
        </button>
        <div className="acciones">
          <button
            type="button"
            className="boton"
            onClick={() => {
              setVentana({ tipo: 'BUSCAR', texto: '' });
            }}
          >
            Buscar (F2)
          </button>
          <button
            type="button"
            className="boton"
            disabled={!seleccionada}
            onClick={() => {
              setVentana({ tipo: 'CANTIDAD' });
            }}
          >
            Cantidad (F4)
          </button>
          <button
            type="button"
            className="boton"
            disabled={seleccionada?.unidad !== 'UN'}
            onClick={() => {
              if (seleccionada) setCarrito((c) => sumarUnidades(c, seleccionada.clave, 1));
            }}
          >
            +1
          </button>
          <button
            type="button"
            className="boton"
            disabled={seleccionada?.unidad !== 'UN'}
            onClick={() => {
              if (seleccionada) setCarrito((c) => sumarUnidades(c, seleccionada.clave, -1));
            }}
          >
            −1
          </button>
          <button
            type="button"
            className="boton"
            disabled={!seleccionada}
            onClick={() => {
              if (seleccionada) setCarrito((c) => quitarLinea(c, seleccionada.clave));
            }}
          >
            Quitar (Supr)
          </button>
          <button
            type="button"
            className="boton boton-peligro"
            disabled={carrito.lineas.length === 0}
            onClick={() => {
              if (confirmarCancelar) cancelarVenta();
              else setConfirmarCancelar(true);
            }}
          >
            {confirmarCancelar ? '¿Seguro? Toca otra vez' : 'Cancelar venta (Esc)'}
          </button>
        </div>
      </aside>

      {ventana?.tipo === 'BUSCAR' && (
        <ModalBuscar
          api={api}
          textoInicial={ventana.texto}
          alCerrar={cerrarVentana}
          alElegir={(p) => {
            cerrarVentana();
            if (p.unit === 'KG') {
              agregar(p, MILI);
              setVentana({ tipo: 'CANTIDAD' });
            } else agregar(p, MILI);
          }}
        />
      )}
      {ventana?.tipo === 'CANTIDAD' && seleccionada && (
        <ModalCantidad
          linea={seleccionada}
          alCerrar={cerrarVentana}
          alAceptar={(milli) => {
            setCarrito((c) => cambiarCantidad(c, seleccionada.clave, milli));
            cerrarVentana();
          }}
        />
      )}
    </section>
  );
}
