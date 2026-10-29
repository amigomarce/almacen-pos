import { asegurarEntero } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';

/** `FIADO`: venta a la cuenta corriente de un vecino (ADR-022). No entra plata a la caja. */
export type MedioPago = 'EFECTIVO' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA' | 'FIADO';

export const MEDIOS_PAGO: readonly MedioPago[] = [
  'EFECTIVO',
  'DEBITO',
  'CREDITO',
  'TRANSFERENCIA',
  'FIADO',
];

/** Medios con que se paga un abono al fiado (no se abona con más fiado). */
export type MedioAbono = Exclude<MedioPago, 'FIADO'>;
export const MEDIOS_ABONO: readonly MedioAbono[] = [
  'EFECTIVO',
  'DEBITO',
  'CREDITO',
  'TRANSFERENCIA',
];

export interface RedondeoEfectivo {
  totalACobrarClp: Clp;
  /** Negativo si se redondeó hacia abajo (ej. -3), positivo si hacia arriba. */
  ajusteClp: Clp;
}

/**
 * Ley 20.956, art. 13: en pagos en dinero efectivo, terminaciones de $1 a $5 bajan a la
 * decena inferior y de $6 a $9 suben a la decena superior. "No generará efecto tributario":
 * la boleta mantiene el total exacto; esto solo cambia lo que se cobra (ADR-001 §5).
 */
export function redondearEfectivo(totalClp: Clp): RedondeoEfectivo {
  asegurarEntero(totalClp, 'totalClp');
  if (totalClp < 0) throw new ErrorDominio('MONTO_NEGATIVO', 'El total no puede ser negativo');
  const unidad = totalClp % 10;
  const ajuste = unidad === 0 ? 0 : unidad <= 5 ? -unidad : 10 - unidad;
  return { totalACobrarClp: totalClp + ajuste, ajusteClp: ajuste };
}

export interface Cobro {
  /** Total de la venta y del documento tributario (sin redondeo). */
  totalClp: Clp;
  /** Va a `sales.rounding_clp`. Cero salvo efectivo. */
  redondeoClp: Clp;
  totalACobrarClp: Clp;
}

export function calcularCobro(
  totalClp: Clp,
  medioPago: MedioPago,
  redondeoHabilitado = true,
): Cobro {
  if (medioPago === 'EFECTIVO' && redondeoHabilitado) {
    const r = redondearEfectivo(totalClp);
    return { totalClp, redondeoClp: r.ajusteClp, totalACobrarClp: r.totalACobrarClp };
  }
  asegurarEntero(totalClp, 'totalClp');
  if (totalClp < 0) throw new ErrorDominio('MONTO_NEGATIVO', 'El total no puede ser negativo');
  return { totalClp, redondeoClp: 0, totalACobrarClp: totalClp };
}

/** Vuelto a entregar. Lanza `PAGO_INSUFICIENTE` si el cliente pasó menos de lo que debe. */
export function calcularVuelto(totalACobrarClp: Clp, pagadoClp: Clp): Clp {
  asegurarEntero(totalACobrarClp, 'totalACobrarClp');
  asegurarEntero(pagadoClp, 'pagadoClp');
  if (pagadoClp < totalACobrarClp) {
    throw new ErrorDominio('PAGO_INSUFICIENTE', 'El monto pagado es menor al total');
  }
  return pagadoClp - totalACobrarClp;
}
