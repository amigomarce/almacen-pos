import { calcularSubtotalLinea, estimarCantidadPorMonto, MILI, type Unidad } from '@almacen/core';

export interface LineaCarrito {
  /** Identificador de la línea en pantalla (no del producto). */
  clave: string;
  /** `null` = venta rápida sin producto (monto libre). */
  productoId: string | null;
  nombre: string;
  unidad: Unidad;
  /** Con monto fijo es el peso estimado (el servidor lo recalcula). */
  cantidadMilli: number;
  /** Precio que se mostró; el servidor recalcula con el precio vigente al cotizar y cobrar. */
  precioUnitarioClp: number;
  /** Por peso: se cobra este monto exacto ("$1.000 de pan", etiqueta con precio). ADR-006. */
  montoFijoClp?: number;
}

export interface Carrito {
  lineas: readonly LineaCarrito[];
  seleccionada: string | null;
}

export const CARRITO_VACIO: Carrito = { lineas: [], seleccionada: null };

export interface ProductoParaCarrito {
  productoId: string;
  nombre: string;
  unidad: Unidad;
  precioUnitarioClp: number;
}

/**
 * Agrega un producto. Escanear otra vez un producto por unidad suma a su línea (así "escanear
 * de nuevo suma 1"); los productos por peso siempre van en líneas separadas.
 */
export function agregarProducto(
  c: Carrito,
  p: ProductoParaCarrito,
  cantidadMilli: number,
  clave: string,
): Carrito {
  if (p.unidad === 'UN') {
    const existente = c.lineas.find(
      (l) => l.productoId === p.productoId && l.unidad === 'UN' && l.montoFijoClp === undefined,
    );
    if (existente) {
      return {
        lineas: c.lineas.map((l) =>
          l.clave === existente.clave
            ? {
                ...l,
                cantidadMilli: l.cantidadMilli + cantidadMilli,
                precioUnitarioClp: p.precioUnitarioClp,
              }
            : l,
        ),
        seleccionada: existente.clave,
      };
    }
  }
  return {
    lineas: [...c.lineas, { clave, ...p, cantidadMilli }],
    seleccionada: clave,
  };
}

/** Producto por peso vendido por monto: "$1.000 de pan" o etiqueta de balanza con precio. */
export function agregarPorMonto(
  c: Carrito,
  p: ProductoParaCarrito,
  montoClp: number,
  clave: string,
): Carrito {
  const linea: LineaCarrito = {
    clave,
    ...p,
    cantidadMilli: estimarCantidadPorMonto(montoClp, p.precioUnitarioClp),
    montoFijoClp: montoClp,
  };
  return { lineas: [...c.lineas, linea], seleccionada: clave };
}

/** Venta rápida sin producto: "Varios $1.500". */
export function agregarMontoLibre(
  c: Carrito,
  nombre: string,
  montoClp: number,
  clave: string,
): Carrito {
  const linea: LineaCarrito = {
    clave,
    productoId: null,
    nombre: nombre.trim() || 'Varios',
    unidad: 'UN',
    cantidadMilli: MILI,
    precioUnitarioClp: montoClp,
  };
  return { lineas: [...c.lineas, linea], seleccionada: clave };
}

/** Cambia la cantidad (o el peso). Quita el monto fijo si lo tenía. */
export function cambiarCantidad(c: Carrito, clave: string, cantidadMilli: number): Carrito {
  if (cantidadMilli <= 0) return quitarLinea(c, clave);
  return {
    ...c,
    lineas: c.lineas.map((l) => {
      if (l.clave !== clave) return l;
      const { montoFijoClp: _montoFijoClp, ...resto } = l;
      return { ...resto, cantidadMilli };
    }),
  };
}

/** Pasa una línea por peso a "por monto". */
export function cambiarMonto(c: Carrito, clave: string, montoClp: number): Carrito {
  return {
    ...c,
    lineas: c.lineas.map((l) =>
      l.clave === clave && l.unidad === 'KG'
        ? {
            ...l,
            montoFijoClp: montoClp,
            cantidadMilli: estimarCantidadPorMonto(montoClp, l.precioUnitarioClp),
          }
        : l,
    ),
  };
}

/** Monto de una línea sin promociones (para mostrar mientras llega la cotización). */
export function montoLocal(l: LineaCarrito): number {
  return l.montoFijoClp ?? calcularSubtotalLinea(l.cantidadMilli, l.precioUnitarioClp);
}

/** Líneas como las pide el servidor (cotizar y cobrar). */
export function aPedido(lineas: readonly LineaCarrito[]) {
  return lineas.map((l) => ({
    productoId: l.productoId,
    cantidadMilli: l.cantidadMilli,
    ...(l.productoId === null
      ? { nombre: l.nombre, unidad: l.unidad, precioUnitarioClp: l.precioUnitarioClp }
      : {}),
    ...(l.montoFijoClp !== undefined ? { montoFijoClp: l.montoFijoClp } : {}),
  }));
}

/** +1 / −1 unidad en un producto por unidad. Llegar a 0 quita la línea. */
export function sumarUnidades(c: Carrito, clave: string, delta: number): Carrito {
  const l = c.lineas.find((x) => x.clave === clave);
  if (l?.unidad !== 'UN') return c;
  return cambiarCantidad(c, clave, l.cantidadMilli + delta * MILI);
}

export function quitarLinea(c: Carrito, clave: string): Carrito {
  const i = c.lineas.findIndex((l) => l.clave === clave);
  if (i < 0) return c;
  const lineas = c.lineas.filter((l) => l.clave !== clave);
  const vecina = lineas[Math.min(i, lineas.length - 1)] ?? null;
  return {
    lineas,
    seleccionada: c.seleccionada === clave ? (vecina?.clave ?? null) : c.seleccionada,
  };
}

export function moverSeleccion(c: Carrito, delta: number): Carrito {
  if (c.lineas.length === 0) return c;
  const i = c.lineas.findIndex((l) => l.clave === c.seleccionada);
  const base = i < 0 ? c.lineas.length - 1 : i;
  const j = Math.max(0, Math.min(c.lineas.length - 1, base + delta));
  return { ...c, seleccionada: c.lineas[j]?.clave ?? null };
}

export function lineaSeleccionada(c: Carrito): LineaCarrito | null {
  return c.lineas.find((l) => l.clave === c.seleccionada) ?? null;
}

/** Total sin promociones, para mostrar mientras llega la cotización del servidor. */
export function totalLocal(c: Carrito): number {
  return c.lineas.reduce((s, l) => s + montoLocal(l), 0);
}

/** Artículos para mostrar: unidades + 1 por cada línea por peso. */
export function contarArticulos(c: Carrito): number {
  return c.lineas.reduce((s, l) => s + (l.unidad === 'UN' ? l.cantidadMilli / MILI : 1), 0);
}
