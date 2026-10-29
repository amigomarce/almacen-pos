/**
 * Ventas en espera: "se me olvidó la leche". La venta en curso se guarda, se atiende al
 * siguiente cliente y después se retoma tal cual. Al retomarla se vuelve a cotizar, así que
 * cobra los precios vigentes.
 *
 * Se guardan en el almacenamiento local de la caja (sobreviven a cerrar y abrir la app). No son
 * ventas: no tocan stock, caja ni boletas hasta que se cobran.
 */
import { CARRITO_VACIO, totalLocal, type Carrito, type LineaCarrito } from './carrito.js';

export interface VentaEnEspera {
  id: string;
  guardadaEn: string;
  lineas: LineaCarrito[];
}

/** Más que esto deja de ser "un cliente que fue a buscar algo". */
export const MAXIMO_EN_ESPERA = 9;

const CLAVE = 'almacen-pos.ventas-en-espera';

/** Lee las ventas en espera; si el almacenamiento no está o está dañado, no hay ninguna. */
export function leerEnEspera(almacen: Pick<Storage, 'getItem'> | null = local()): VentaEnEspera[] {
  try {
    const crudo = almacen?.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? (datos as VentaEnEspera[]).filter(esVentaEnEspera) : [];
  } catch {
    return [];
  }
}

export function guardarEnEspera(
  ventas: readonly VentaEnEspera[],
  almacen: Pick<Storage, 'setItem' | 'removeItem'> | null = local(),
): void {
  try {
    if (ventas.length === 0) almacen?.removeItem(CLAVE);
    else almacen?.setItem(CLAVE, JSON.stringify(ventas));
  } catch {
    // Sin almacenamiento: las ventas en espera duran mientras la app esté abierta.
  }
}

function local(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function esVentaEnEspera(v: unknown): v is VentaEnEspera {
  if (typeof v !== 'object' || v === null) return false;
  const x = v as Partial<VentaEnEspera>;
  return (
    typeof x.id === 'string' &&
    typeof x.guardadaEn === 'string' &&
    Array.isArray(x.lineas) &&
    x.lineas.length > 0
  );
}

export type ResultadoEspera =
  | { ok: true; enEspera: VentaEnEspera[]; carrito: Carrito }
  | { ok: false; motivo: 'VACIA' | 'LLENA' };

/** Pone la venta en curso en espera y deja la caja libre para el siguiente cliente. */
export function ponerEnEspera(
  enEspera: readonly VentaEnEspera[],
  carrito: Carrito,
  id: string,
  ahora = new Date(),
): ResultadoEspera {
  if (carrito.lineas.length === 0) return { ok: false, motivo: 'VACIA' };
  if (enEspera.length >= MAXIMO_EN_ESPERA) return { ok: false, motivo: 'LLENA' };
  return {
    ok: true,
    enEspera: [...enEspera, { id, guardadaEn: ahora.toISOString(), lineas: [...carrito.lineas] }],
    carrito: CARRITO_VACIO,
  };
}

/**
 * Retoma una venta en espera. Si había otra venta en curso, esa queda en espera en su lugar
 * (no se pierde nada).
 */
export function retomar(
  enEspera: readonly VentaEnEspera[],
  carritoActual: Carrito,
  id: string,
  idParaActual: string,
  ahora = new Date(),
): { enEspera: VentaEnEspera[]; carrito: Carrito } | null {
  const elegida = enEspera.find((v) => v.id === id);
  if (!elegida) return null;
  const resto = enEspera.filter((v) => v.id !== id);
  const conActual =
    carritoActual.lineas.length > 0
      ? [
          ...resto,
          { id: idParaActual, guardadaEn: ahora.toISOString(), lineas: [...carritoActual.lineas] },
        ]
      : resto;
  return {
    enEspera: conActual,
    carrito: { lineas: elegida.lineas, seleccionada: elegida.lineas.at(-1)?.clave ?? null },
  };
}

/** Total aproximado (con los precios del momento en que se guardó). */
export function totalEnEspera(v: VentaEnEspera): number {
  return totalLocal({ lineas: v.lineas, seleccionada: null });
}
