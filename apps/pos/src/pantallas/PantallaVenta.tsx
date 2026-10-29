import { formatearCantidad, formatearClp, MILI } from '@almacen/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ErrorApi,
  type BotonRapido,
  type ClienteApi,
  type ConfiguracionLocal,
  type Cotizacion,
  type MedioPago,
  type ProductoLocal,
  type ProductoSugerido,
  type VentaRegistrada,
} from '../api.js';
import { useTeclado } from '../useTeclado.js';
import {
  agregarMontoLibre,
  agregarPorMonto,
  agregarProducto,
  aPedido,
  cambiarCantidad,
  cambiarMonto,
  montoLocal,
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
import { ModalAltaProducto } from '../venta/ModalAltaProducto.js';
import { ModalBuscar } from '../venta/ModalBuscar.js';
import { ModalCantidad } from '../venta/ModalCantidad.js';
import { ModalCobro } from '../venta/ModalCobro.js';
import { ModalVentaLista, type EstadoImpresion } from '../venta/ModalVentaLista.js';
import { ModalMontoLibre } from '../venta/ModalMontoLibre.js';
import { ModalPesoMonto, type ResultadoPesoMonto } from '../venta/ModalPesoMonto.js';
import { ModalEnEspera } from '../venta/ModalEnEspera.js';
import {
  guardarEnEspera,
  leerEnEspera,
  MAXIMO_EN_ESPERA,
  ponerEnEspera,
  retomar,
  type VentaEnEspera,
} from '../venta/espera.js';

type Mensaje = { tipo: 'error' | 'aviso'; texto: string } | null;
type Ventana =
  | { tipo: 'BUSCAR'; texto: string }
  | { tipo: 'CANTIDAD' }
  /** Producto por peso nuevo: kg o monto. */
  | { tipo: 'PESO_MONTO'; producto: ProductoLocal }
  /** F4 sobre una línea por peso. */
  | { tipo: 'EDITAR_PESO' }
  | { tipo: 'MONTO_LIBRE'; nombre: string }
  /** Código desconocido: alta rápida (precio y stock). */
  | { tipo: 'ALTA'; codigo: string | null; sugerido: ProductoSugerido | null; unidades: number }
  /** El id de la venta se genera al abrir el cobro: reintentar no duplica la venta. */
  | { tipo: 'COBRO'; id: string }
  | { tipo: 'LISTA'; venta: VentaRegistrada; impresion: EstadoImpresion }
  /** F8 con varias ventas en espera: elegir cuál retomar. */
  | { tipo: 'ESPERA' }
  | null;

/** Esc dos veces dentro de este tiempo cancela la venta (sin ventana de confirmación). */
const ESPERA_CANCELAR_MS = 3000;

const nuevaClave = () => crypto.randomUUID();

interface Props {
  api: ClienteApi;
  /**
   * `false` mientras se usa otra pestaña: la venta en curso se conserva, pero sin teclado ni
   * foco. Al volver se recargan los botones rápidos y la configuración.
   */
  activa?: boolean;
}

export function PantallaVenta({ api, activa = true }: Props) {
  const [carrito, setCarrito] = useState<Carrito>(CARRITO_VACIO);
  const [cotizacion, setCotizacion] = useState<{ carrito: Carrito; datos: Cotizacion } | null>(
    null,
  );
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [enEspera, setEnEspera] = useState<VentaEnEspera[]>(() => leerEnEspera());
  useEffect(() => {
    guardarEnEspera(enEspera);
  }, [enEspera]);
  const [botones, setBotones] = useState<BotonRapido[]>([]);
  const [config, setConfig] = useState<ConfiguracionLocal | null>(null);
  const [cobrando, setCobrando] = useState(false);
  /** F12 antes de que llegue el total del servidor: el cobro se abre apenas llegue. */
  const cobroPendiente = useRef(false);
  /** Códigos escaneados cuya búsqueda sigue en curso. */
  const busquedas = useRef(0);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const detector = useRef(new DetectorEscaneo());

  // Foco permanente en el campo de escaneo (el lector "tipea" ahí), salvo con una ventana abierta.
  const hayVentana = useRef(false);
  const estaActiva = useRef(activa);
  useEffect(() => {
    hayVentana.current = ventana !== null;
    estaActiva.current = activa;
  });
  const enfocar = useCallback(() => {
    setTimeout(() => {
      if (!hayVentana.current && estaActiva.current) campo.current?.focus();
    }, 0);
  }, []);
  useEffect(() => {
    if (activa) enfocar();
  }, [activa, enfocar]);

  // Botones de venta rápida (pan, huevos, verduras...). Si fallan, la caja vende igual.
  useEffect(() => {
    if (!activa) return;
    let vigente = true;
    api
      .botonesRapidos()
      .then((b) => {
        if (vigente) setBotones(b);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [api, activa]);

  // Configuración del local: redondeo de efectivo y modalidad de boleta.
  useEffect(() => {
    if (!activa) return;
    let vigente = true;
    api
      .configuracion()
      .then((c) => {
        if (vigente) setConfig(c);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [api, activa]);

  // Cotiza en el servidor cada vez que cambia el carrito: precios vigentes y promociones.
  useEffect(() => {
    if (carrito.lineas.length === 0) return;
    let vigente = true;
    api
      .cotizar(aPedido(carrito.lineas))
      .then((datos) => {
        if (!vigente) return;
        setCotizacion({ carrito, datos });
        if (cobroPendiente.current && busquedas.current === 0) {
          cobroPendiente.current = false;
          setMensaje(null);
          setErrorCobro(null);
          setVentana({ tipo: 'COBRO', id: crypto.randomUUID() });
        }
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        cobroPendiente.current = false;
        if (e instanceof ErrorApi && e.estado !== 0)
          setMensaje({ tipo: 'error', texto: e.message });
      });
    return () => {
      vigente = false;
    };
  }, [api, carrito]);

  const actualizada = cotizacion?.carrito === carrito ? cotizacion.datos : null;
  const total = carrito.lineas.length === 0 ? 0 : (actualizada?.totalClp ?? totalLocal(carrito));

  const agregar = useCallback((p: ProductoLocal, como: ResultadoPesoMonto) => {
    const datos = {
      productoId: p.id,
      nombre: p.name,
      unidad: p.unit,
      precioUnitarioClp: p.priceClp,
    };
    let estimado = 0;
    setCarrito((c) => {
      const nuevo =
        como.tipo === 'PESO'
          ? agregarProducto(c, datos, como.cantidadMilli, nuevaClave())
          : agregarPorMonto(c, datos, como.montoClp, nuevaClave());
      estimado = lineaSeleccionada(nuevo)?.cantidadMilli ?? 0;
      return nuevo;
    });
    setConfirmarCancelar(false);
    const cantidad = como.tipo === 'PESO' ? como.cantidadMilli : estimado;
    setMensaje(
      p.stockQtyMilli - cantidad <= 0
        ? { tipo: 'aviso', texto: `Stock en 0 o negativo: ${p.name}. Revisa el inventario.` }
        : null,
    );
  }, []);

  /** Por unidad se agrega directo; por peso se pregunta kg o monto. */
  /** Devuelve `true` si lo agregó de inmediato (por unidad). */
  const elegirProducto = useCallback(
    (p: ProductoLocal, unidades = 1): boolean => {
      if (p.unit === 'KG') {
        setVentana({ tipo: 'PESO_MONTO', producto: p });
        return false;
      }
      agregar(p, { tipo: 'PESO', cantidadMilli: unidades * MILI });
      return true;
    },
    [agregar],
  );

  const procesarCodigo = useCallback(
    async (codigo: string, multiplicador: number | null) => {
      busquedas.current += 1;
      let agregado = false;
      try {
        const r = await api.buscarCodigo(codigo);
        if (r.origen === 'LOCAL') {
          const p = r.producto;
          if (r.balanza) {
            if (p.unit !== 'KG') {
              setMensaje({
                tipo: 'error',
                texto: `${p.name} está configurado por unidad, no por peso.`,
              });
              return;
            }
            // Etiqueta con peso: ese peso. Etiqueta con precio: ese monto exacto (ADR-006).
            agregar(
              p,
              r.balanza.tipo === 'PESO'
                ? { tipo: 'PESO', cantidadMilli: r.balanza.pesoGramos }
                : { tipo: 'MONTO', montoClp: r.balanza.precioClp },
            );
            agregado = true;
            return;
          }
          agregado = elegirProducto(p, multiplicador ?? 1);
          return;
        }
        if (r.origen === 'NO_ENCONTRADO' && r.balanza) {
          setMensaje({
            tipo: 'error',
            texto: `La etiqueta de balanza (producto ${r.balanza.codigoProducto}) no está asociada a ningún producto.`,
          });
          return;
        }
        // Código desconocido: se da de alta ahí mismo (con los datos de la semilla si los hay).
        setMensaje(null);
        setVentana({
          tipo: 'ALTA',
          codigo,
          sugerido: r.origen === 'NO_ENCONTRADO' ? null : r.producto,
          unidades: multiplicador ?? 1,
        });
      } catch (e) {
        setMensaje({
          tipo: 'error',
          texto: e instanceof ErrorApi ? e.message : 'No se pudo buscar el código',
        });
      } finally {
        busquedas.current -= 1;
        // Si F12 esperaba este producto y no se agregó, se cancela la espera.
        if (!agregado) cobroPendiente.current = false;
      }
    },
    [api, agregar, elegirProducto],
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
    hayVentana.current = false;
    setVentana(null);
    enfocar();
  };

  /** Retoma una venta en espera; la que estaba en curso (si había) queda en espera. */
  const retomarVenta = (id: string) => {
    const r = retomar(enEspera, carrito, id, nuevaClave());
    setVentana(null);
    if (!r) return;
    setEnEspera(r.enEspera);
    setCarrito(r.carrito);
    setCotizacion(null);
    setConfirmarCancelar(false);
    setMensaje({ tipo: 'aviso', texto: 'Venta retomada.' });
    enfocar();
  };

  /** F8: con venta en curso la deja en espera; sin venta, retoma (o deja elegir cuál). */
  const alternarEspera = () => {
    if (carrito.lineas.length > 0) {
      const r = ponerEnEspera(enEspera, carrito, nuevaClave());
      if (!r.ok) {
        setMensaje({
          tipo: 'error',
          texto: `Ya hay ${MAXIMO_EN_ESPERA} ventas en espera: retoma o cancela alguna.`,
        });
        return;
      }
      setEnEspera(r.enEspera);
      setCarrito(r.carrito);
      setCotizacion(null);
      setConfirmarCancelar(false);
      setMensaje({
        tipo: 'aviso',
        texto: `Venta en espera (${r.enEspera.length}). Atiende al siguiente cliente; F8 la retoma.`,
      });
      return;
    }
    const [unica] = enEspera;
    if (enEspera.length === 1 && unica) retomarVenta(unica.id);
    else if (enEspera.length > 1) setVentana({ tipo: 'ESPERA' });
    else setMensaje({ tipo: 'aviso', texto: 'No hay ventas en espera.' });
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

  /** F4: unidades, o kg/monto si la línea es por peso. */
  const abrirCantidad = () => {
    if (!seleccionada) return;
    setVentana(seleccionada.unidad === 'KG' ? { tipo: 'EDITAR_PESO' } : { tipo: 'CANTIDAD' });
  };

  /** F12: abre el cobro con el total ya calculado por el servidor. */
  const abrirCobro = () => {
    if (carrito.lineas.length === 0 && busquedas.current === 0) return;
    if (!actualizada || busquedas.current > 0) {
      cobroPendiente.current = true;
      setMensaje({ tipo: 'aviso', texto: 'Calculando el total…' });
      return;
    }
    setErrorCobro(null);
    setVentana({ tipo: 'COBRO', id: crypto.randomUUID() });
  };

  const imprimir = useCallback(
    async (venta: VentaRegistrada, reimpresion = false) => {
      const actualizar = (impresion: EstadoImpresion) => {
        setVentana((v) =>
          v?.tipo === 'LISTA' && v.venta.id === venta.id ? { ...v, impresion } : v,
        );
      };
      actualizar({ tipo: 'IMPRIMIENDO' });
      try {
        actualizar({ tipo: 'LISTO', resultado: await api.imprimirVenta(venta.id, reimpresion) });
      } catch (e) {
        actualizar({
          tipo: 'ERROR',
          mensaje: e instanceof ErrorApi ? e.message : 'No se pudo imprimir',
          vistaPrevia:
            e instanceof ErrorApi && typeof e.datos['vistaPrevia'] === 'string'
              ? e.datos['vistaPrevia']
              : null,
        });
      }
    },
    [api],
  );

  const cobrar = async (id: string, medioPago: MedioPago, pagadoClp: number) => {
    if (!actualizada || cobrando) return;
    setCobrando(true);
    setErrorCobro(null);
    try {
      const venta = await api.registrarVenta({
        id,
        lineas: aPedido(carrito.lineas),
        medioPago,
        ...(medioPago === 'EFECTIVO' ? { pagadoClp } : {}),
        totalEsperadoClp: actualizada.totalClp,
      });
      // Venta guardada: se limpia la pantalla y se muestra el vuelto mientras imprime.
      setCarrito(CARRITO_VACIO);
      setCotizacion(null);
      setMensaje(null);
      setVentana({ tipo: 'LISTA', venta, impresion: { tipo: 'IMPRIMIENDO' } });
      void imprimir(venta);
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'TOTAL_CAMBIO') {
        // Precios cambiados (ej. desde el celular): se recotiza y el cajero vuelve a cobrar.
        cerrarVentana();
        setCarrito((c) => ({ ...c }));
        setMensaje({ tipo: 'error', texto: `${e.message}. Revisa y cobra de nuevo.` });
      } else if (e instanceof ErrorApi && e.estado === 0) {
        setErrorCobro(`${e.message}. La venta no se guardó: reintenta.`);
      } else {
        setErrorCobro(e instanceof ErrorApi ? e.message : 'No se pudo guardar la venta');
      }
    } finally {
      setCobrando(false);
    }
  };

  const alBotonRapido = (b: BotonRapido) => {
    if (b.producto) elegirProducto(b.producto);
    else setVentana({ tipo: 'MONTO_LIBRE', nombre: b.label });
  };

  useTeclado((e) => {
    // Con la búsqueda o el vuelto en pantalla, un escaneo igual se reconoce: cierra y agrega.
    if (ventana) {
      // Esc lo maneja la ventana misma (componentes/Modal).
      if (e.key === 'Escape') return;
      // Solo donde un escaneo significa "siguiente producto". En ventanas donde se escriben
      // números (cobro, cantidad, monto) el detector confundiría un monto con un código.
      if (ventana.tipo !== 'BUSCAR' && ventana.tipo !== 'LISTA') return;
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
        abrirCantidad();
        return;
      case 'F8':
        e.preventDefault();
        alternarEspera();
        return;
      case 'F12':
        e.preventDefault();
        abrirCobro();
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
  }, activa);

  return (
    <section className="venta" style={activa ? undefined : { display: 'none' }}>
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
            if (!ventana && activa) enfocar();
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
        <div className="botones-rapidos" role="group" aria-label="Venta rápida">
          {botones.map((b) => (
            <button
              key={b.id}
              type="button"
              className="boton boton-rapido"
              onClick={() => {
                alBotonRapido(b);
              }}
            >
              {b.label}
              {b.producto && (
                <span className="suave">
                  {formatearClp(b.producto.priceClp)}
                  {b.producto.unit === 'KG' ? '/kg' : ''}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            className="boton boton-rapido"
            onClick={() => {
              setVentana({ tipo: 'MONTO_LIBRE', nombre: 'Varios' });
            }}
          >
            Sin código
            <span className="suave">monto libre</span>
          </button>
        </div>
        {carrito.lineas.length === 0 ? (
          <p className="venta-vacia">Escanea un producto para empezar</p>
        ) : (
          <ul className="lineas" aria-label="Productos de la venta">
            {carrito.lineas.map((l, i) => {
              const cot = actualizada?.lineas[i];
              const totalLinea = cot ? cot.totalLineaClp : montoLocal(l);
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
                      {l.montoFijoClp !== undefined ? '≈' : ''}
                      {formatearCantidad(l.cantidadMilli, l.unidad)} x{' '}
                      {formatearClp(cot?.precioUnitarioClp ?? l.precioUnitarioClp)}
                      {l.unidad === 'KG' ? '/kg' : ''}
                      {l.montoFijoClp !== undefined ? ' · por monto' : ''}
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
          disabled={carrito.lineas.length === 0}
          onClick={abrirCobro}
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
          <button type="button" className="boton" disabled={!seleccionada} onClick={abrirCantidad}>
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
            className="boton"
            disabled={carrito.lineas.length === 0 && enEspera.length === 0}
            onClick={alternarEspera}
          >
            {carrito.lineas.length > 0
              ? 'Poner en espera (F8)'
              : `Retomar en espera${enEspera.length > 0 ? ` (${enEspera.length})` : ''} (F8)`}
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

      {ventana?.tipo === 'ESPERA' && (
        <ModalEnEspera
          ventas={enEspera}
          hayVentaEnCurso={carrito.lineas.length > 0}
          alRetomar={retomarVenta}
          alCerrar={cerrarVentana}
        />
      )}
      {ventana?.tipo === 'BUSCAR' && (
        <ModalBuscar
          api={api}
          textoInicial={ventana.texto}
          alCerrar={cerrarVentana}
          alElegir={(p) => {
            cerrarVentana();
            elegirProducto(p);
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
      {ventana?.tipo === 'PESO_MONTO' && (
        <ModalPesoMonto
          nombre={ventana.producto.name}
          precioPorKgClp={ventana.producto.priceClp}
          alCerrar={cerrarVentana}
          alAceptar={(r) => {
            agregar(ventana.producto, r);
            cerrarVentana();
          }}
        />
      )}
      {ventana?.tipo === 'EDITAR_PESO' && seleccionada && (
        <ModalPesoMonto
          nombre={seleccionada.nombre}
          precioPorKgClp={seleccionada.precioUnitarioClp}
          modoInicial={seleccionada.montoFijoClp !== undefined ? 'MONTO' : 'PESO'}
          alCerrar={cerrarVentana}
          alAceptar={(r) => {
            setCarrito((c) =>
              r.tipo === 'PESO'
                ? cambiarCantidad(c, seleccionada.clave, r.cantidadMilli)
                : cambiarMonto(c, seleccionada.clave, r.montoClp),
            );
            cerrarVentana();
          }}
        />
      )}
      {ventana?.tipo === 'COBRO' && actualizada && (
        <ModalCobro
          totalClp={actualizada.totalClp}
          redondeoHabilitado={config?.cashRoundingEnabled ?? true}
          enviando={cobrando}
          error={errorCobro}
          alCerrar={cerrarVentana}
          alCobrar={(medio, pagado) => void cobrar(ventana.id, medio, pagado)}
        />
      )}
      {ventana?.tipo === 'LISTA' && (
        <ModalVentaLista
          api={api}
          venta={ventana.venta}
          impresion={ventana.impresion}
          alReimprimir={() => void imprimir(ventana.venta, true)}
          alActualizar={(venta) => {
            setVentana({ ...ventana, venta });
          }}
          alTerminar={cerrarVentana}
        />
      )}
      {ventana?.tipo === 'ALTA' && (
        <ModalAltaProducto
          api={api}
          codigo={ventana.codigo}
          sugerido={ventana.sugerido}
          alCerrar={cerrarVentana}
          alCrear={(p) => {
            const unidades = ventana.unidades;
            cerrarVentana();
            elegirProducto(p, unidades);
          }}
        />
      )}
      {ventana?.tipo === 'MONTO_LIBRE' && (
        <ModalMontoLibre
          nombreInicial={ventana.nombre}
          alCerrar={cerrarVentana}
          alAceptar={(nombre, monto) => {
            setCarrito((c) => agregarMontoLibre(c, nombre, monto, nuevaClave()));
            setMensaje(null);
            setConfirmarCancelar(false);
            cerrarVentana();
          }}
        />
      )}
    </section>
  );
}
