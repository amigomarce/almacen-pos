import { asegurarEntero, dividirRedondeado, multiplicarSeguro } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';
import { redondearEfectivo, type MedioPago } from './pago.js';

/** Una línea de la venta original, con lo que ya se devolvió antes. */
export interface LineaDevolvible {
  id: string;
  cantidadMilli: number;
  /** Total de la línea (con descuentos y promociones): lo que pagó el cliente por ella. */
  totalLineaClp: Clp;
  devueltoMilli: number;
  devueltoClp: Clp;
}

export interface ItemDevolucion {
  lineaId: string;
  cantidadMilli: number;
}

export interface ItemDevueltoCalculado {
  lineaId: string;
  cantidadMilli: number;
  montoClp: Clp;
}

export interface CalculoDevolucion {
  items: ItemDevueltoCalculado[];
  /** Suma de los montos (lo que dice el documento). */
  totalClp: Clp;
  /** Ajuste Ley 20.956 si se devuelve en efectivo (0 en otros medios). */
  redondeoClp: Clp;
  /** Lo que se entrega al cliente: total + redondeo. */
  aEntregarClp: Clp;
}

/**
 * Calcula cuánto se devuelve por una devolución parcial. Cada línea devuelve lo proporcional a
 * lo que el cliente pagó por ella (con su descuento o promoción), redondeado al peso. Si se
 * devuelve todo lo que quedaba de la línea, se devuelve exactamente lo que faltaba (sin restos
 * por redondeo). Nunca se devuelve más de lo pagado.
 *
 * En efectivo se aplica el mismo redondeo a la decena que al cobrar.
 * TODO(SII): verificar el redondeo de efectivo en devoluciones (SII_BOLETA_ELECTRONICA.md §6).
 */
export function calcularDevolucion(
  lineas: readonly LineaDevolvible[],
  pedido: readonly ItemDevolucion[],
  medioPago: MedioPago,
  redondeoHabilitado: boolean,
): CalculoDevolucion {
  if (pedido.length === 0) {
    throw new ErrorDominio('DEVOLUCION_VACIA', 'Elige al menos un producto para devolver');
  }
  const vistos = new Set<string>();
  const items = pedido.map((p): ItemDevueltoCalculado => {
    asegurarEntero(p.cantidadMilli, 'cantidadMilli');
    if (vistos.has(p.lineaId)) {
      throw new ErrorDominio('LINEA_REPETIDA', 'Un producto aparece dos veces en la devolución');
    }
    vistos.add(p.lineaId);
    const l = lineas.find((x) => x.id === p.lineaId);
    if (!l) throw new ErrorDominio('LINEA_INEXISTENTE', 'Ese producto no está en la venta');
    const quedaMilli = l.cantidadMilli - l.devueltoMilli;
    const quedaClp = l.totalLineaClp - l.devueltoClp;
    if (p.cantidadMilli <= 0) {
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'La cantidad a devolver debe ser mayor que cero');
    }
    if (p.cantidadMilli > quedaMilli) {
      throw new ErrorDominio(
        'DEVOLUCION_EXCEDE',
        'No se puede devolver más de lo que se vendió (o de lo que queda por devolver)',
      );
    }
    const montoClp =
      p.cantidadMilli === quedaMilli
        ? quedaClp
        : Math.min(
            quedaClp,
            dividirRedondeado(multiplicarSeguro(l.totalLineaClp, p.cantidadMilli), l.cantidadMilli),
          );
    return { lineaId: p.lineaId, cantidadMilli: p.cantidadMilli, montoClp };
  });
  const totalClp = items.reduce((s, i) => s + i.montoClp, 0);
  const redondeoClp =
    medioPago === 'EFECTIVO' && redondeoHabilitado ? redondearEfectivo(totalClp).ajusteClp : 0;
  return { items, totalClp, redondeoClp, aEntregarClp: totalClp + redondeoClp };
}
