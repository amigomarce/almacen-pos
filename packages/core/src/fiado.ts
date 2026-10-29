/**
 * Fiado / cuenta corriente de vecinos (ADR-022). La cuenta es una lista de movimientos que solo
 * crece: positivo = aumenta la deuda (venta fiada), negativo = la baja (abono, anulación,
 * devolución, ajuste a favor). El saldo es la suma.
 */
import { asegurarEntero } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';

/** Saldo de la cuenta: lo que el vecino debe (negativo = a favor del vecino). */
export function saldoCuenta(movimientos: readonly { montoClp: Clp }[]): Clp {
  return movimientos.reduce((s, m) => {
    asegurarEntero(m.montoClp, 'montoClp');
    return s + m.montoClp;
  }, 0);
}

export interface EvaluacionFiado {
  saldoNuevoClp: Clp;
  /** Con límite y superado: la venta necesita la autorización del dueño. */
  excedeLimite: boolean;
}

/**
 * ¿Se puede fiar este monto? Nunca se bloquea: si supera el límite, la caja pide la clave del
 * dueño. Sin límite (`null`) nunca excede.
 */
export function evaluarFiado(saldoClp: Clp, montoClp: Clp, limiteClp: Clp | null): EvaluacionFiado {
  asegurarEntero(saldoClp, 'saldoClp');
  asegurarEntero(montoClp, 'montoClp');
  if (montoClp <= 0) {
    throw new ErrorDominio('MONTO_INVALIDO', 'El monto fiado debe ser mayor que cero');
  }
  if (limiteClp !== null) asegurarEntero(limiteClp, 'limiteClp');
  const saldoNuevoClp = saldoClp + montoClp;
  return { saldoNuevoClp, excedeLimite: limiteClp !== null && saldoNuevoClp > limiteClp };
}

/** Valida un abono: positivo y no mayor que la deuda (no se deja saldo a favor). */
export function validarAbono(saldoClp: Clp, montoClp: Clp): void {
  asegurarEntero(saldoClp, 'saldoClp');
  asegurarEntero(montoClp, 'montoClp');
  if (montoClp <= 0) {
    throw new ErrorDominio('MONTO_INVALIDO', 'El abono debe ser mayor que cero');
  }
  if (montoClp > saldoClp) {
    throw new ErrorDominio(
      'ABONO_EXCEDE_DEUDA',
      saldoClp > 0 ? 'El abono es mayor que lo que debe' : 'El vecino no tiene deuda',
    );
  }
}
