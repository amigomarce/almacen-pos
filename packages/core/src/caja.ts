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
  /** Efectivo que debería haber en el cajón: inicial + cobrado en efectivo. */
  efectivoEsperadoClp: Clp;
}

/** Resume una sesión de caja. Las ventas anuladas no suman, pero se informan aparte. */
export function cuadrarCaja(
  efectivoInicialClp: Clp,
  ventas: readonly VentaParaCuadratura[],
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

  return {
    porMedio,
    cantidadVentas,
    totalVentasClp: totalVentas,
    redondeoClp: redondeo,
    totalCobradoClp: totalVentas + redondeo,
    anuladas,
    efectivoInicialClp,
    efectivoEsperadoClp: efectivoInicialClp + porMedio.EFECTIVO.cobradoClp,
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
