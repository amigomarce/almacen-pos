import { asegurarEntero } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';
import { MEDIOS_PAGO, type MedioPago } from './pago.js';

/** Lo mínimo de cada venta para cuadrar la caja. */
export interface VentaParaCuadratura {
  medioPago: MedioPago;
  /** Total de la venta sin redondeo de efectivo. */
  totalClp: Clp;
  /** Ajuste de efectivo (Ley 20.956). Lo cobrado = total + redondeo. */
  redondeoClp: Clp;
  anulada: boolean;
}

/** Plata que entra o sale del cajón sin ser una venta (pago a proveedor, cambio, retiro). */
export type TipoMovimientoEfectivo = 'RETIRO' | 'INGRESO';

export interface MovimientoEfectivo {
  tipo: TipoMovimientoEfectivo;
  /** Siempre positivo; el tipo dice si suma o resta. */
  montoClp: Clp;
}

/** Una devolución parcial hecha en el turno. */
export interface DevolucionParaCuadratura {
  medioPago: MedioPago;
  /** Lo devuelto según el documento. */
  totalClp: Clp;
  /** Ajuste de redondeo si se devolvió en efectivo. Lo entregado = total + redondeo. */
  redondeoClp: Clp;
}

export interface TotalMedio {
  cantidad: number;
  /** Lo que realmente se cobró por este medio (incluye el redondeo en efectivo). */
  cobradoClp: Clp;
}

export interface CuadraturaCaja {
  porMedio: Record<MedioPago, TotalMedio>;
  cantidadVentas: number;
  /** Suma de las ventas válidas, sin redondeo (lo que dicen los comprobantes). */
  totalVentasClp: Clp;
  /** Suma de los ajustes de redondeo de efectivo (puede ser negativa). */
  redondeoClp: Clp;
  /** Suma de lo cobrado por todos los medios. */
  totalCobradoClp: Clp;
  anuladas: { cantidad: number; totalClp: Clp };
  efectivoInicialClp: Clp;
  /** Retiros e ingresos de efectivo del turno (no son ventas). */
  movimientos: { retirosClp: Clp; ingresosClp: Clp; cantidad: number };
  /**
   * Devoluciones parciales hechas en el turno. `totalClp` es lo devuelto según los documentos;
   * `efectivoClp`, lo entregado en efectivo (con redondeo), que sale del cajón.
   */
  devoluciones: { cantidad: number; totalClp: Clp; efectivoClp: Clp };
  /**
   * Efectivo que debería haber en el cajón: inicial + cobrado en efectivo + ingresos − retiros
   * − devoluciones en efectivo.
   */
  efectivoEsperadoClp: Clp;
}

/** Valida un movimiento de efectivo: entero y mayor que cero. */
export function validarMovimientoEfectivo(m: MovimientoEfectivo): void {
  asegurarEntero(m.montoClp, 'montoClp');
  if (m.montoClp <= 0) {
    throw new ErrorDominio('MONTO_INVALIDO', 'El monto del movimiento debe ser mayor que cero');
  }
  // Los datos pueden venir de la base o de la red: se valida aunque el tipo diga lo contrario.
  const tipo: string = m.tipo;
  if (tipo !== 'RETIRO' && tipo !== 'INGRESO') {
    throw new ErrorDominio('MOVIMIENTO_INVALIDO', 'El movimiento debe ser un retiro o un ingreso');
  }
}

/** Resume una sesión de caja. Las ventas anuladas no suman, pero se informan aparte. */
export function cuadrarCaja(
  efectivoInicialClp: Clp,
  ventas: readonly VentaParaCuadratura[],
  movimientos: readonly MovimientoEfectivo[] = [],
  devoluciones: readonly DevolucionParaCuadratura[] = [],
): CuadraturaCaja {
  asegurarEntero(efectivoInicialClp, 'efectivoInicialClp');
  if (efectivoInicialClp < 0) {
    throw new ErrorDominio('MONTO_NEGATIVO', 'El efectivo inicial no puede ser negativo');
  }
  const porMedio = Object.fromEntries(
    MEDIOS_PAGO.map((m) => [m, { cantidad: 0, cobradoClp: 0 }]),
  ) as Record<MedioPago, TotalMedio>;
  const anuladas = { cantidad: 0, totalClp: 0 };
  let cantidadVentas = 0;
  let totalVentas = 0;
  let redondeo = 0;

  ventas.forEach((v, i) => {
    asegurarEntero(v.totalClp, `venta ${i + 1}: total`);
    asegurarEntero(v.redondeoClp, `venta ${i + 1}: redondeo`);
    if (v.redondeoClp !== 0 && v.medioPago !== 'EFECTIVO') {
      throw new ErrorDominio(
        'REDONDEO_INVALIDO',
        `venta ${i + 1}: solo los pagos en efectivo se redondean`,
      );
    }
    if (v.anulada) {
      anuladas.cantidad += 1;
      anuladas.totalClp += v.totalClp;
      return;
    }
    const medio = porMedio[v.medioPago];
    medio.cantidad += 1;
    medio.cobradoClp += v.totalClp + v.redondeoClp;
    cantidadVentas += 1;
    totalVentas += v.totalClp;
    redondeo += v.redondeoClp;
  });

  let retiros = 0;
  let ingresos = 0;
  for (const m of movimientos) {
    validarMovimientoEfectivo(m);
    if (m.tipo === 'RETIRO') retiros += m.montoClp;
    else ingresos += m.montoClp;
  }

  const dev = { cantidad: 0, totalClp: 0, efectivoClp: 0 };
  devoluciones.forEach((d, i) => {
    asegurarEntero(d.totalClp, `devolución ${i + 1}: total`);
    asegurarEntero(d.redondeoClp, `devolución ${i + 1}: redondeo`);
    // $0 es válido: un producto que iba de regalo en una promoción solo vuelve al stock.
    if (d.totalClp < 0) {
      throw new ErrorDominio(
        'MONTO_INVALIDO',
        `devolución ${i + 1}: el total no puede ser negativo`,
      );
    }
    dev.cantidad += 1;
    dev.totalClp += d.totalClp;
    if (d.medioPago === 'EFECTIVO') dev.efectivoClp += d.totalClp + d.redondeoClp;
  });

  return {
    porMedio,
    cantidadVentas,
    totalVentasClp: totalVentas,
    redondeoClp: redondeo,
    totalCobradoClp: totalVentas + redondeo,
    anuladas,
    efectivoInicialClp,
    movimientos: { retirosClp: retiros, ingresosClp: ingresos, cantidad: movimientos.length },
    devoluciones: dev,
    efectivoEsperadoClp:
      efectivoInicialClp + porMedio.EFECTIVO.cobradoClp + ingresos - retiros - dev.efectivoClp,
  };
}

/** Positivo = sobra plata; negativo = falta. */
export function diferenciaCaja(efectivoEsperadoClp: Clp, efectivoContadoClp: Clp): Clp {
  asegurarEntero(efectivoEsperadoClp, 'efectivoEsperadoClp');
  asegurarEntero(efectivoContadoClp, 'efectivoContadoClp');
  if (efectivoContadoClp < 0) {
    throw new ErrorDominio('MONTO_NEGATIVO', 'El efectivo contado no puede ser negativo');
  }
  return efectivoContadoClp - efectivoEsperadoClp;
}
