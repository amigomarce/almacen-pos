import { ErrorDominio, type MedioPago, type TotalesDocumento } from '@almacen/core';
import type { ModeloEmision, TipoDte, VentaParaDte } from './tipos.js';

/** ¿Esta venta necesita boleta emitida por la caja? (ADR-001 §4, Res. 76/2021). */
export function requiereBoleta(modelo: ModeloEmision, medioPago: MedioPago): boolean {
  if (modelo === 'TODO_MEDIO_PAGO') return true;
  // Fiado (ADR-022): es una venta al entregar el producto; no hay voucher que sirva de boleta.
  // TODO(SII): confirmar que la boleta se emite al vender fiado y no al recibir el pago.
  return medioPago === 'EFECTIVO' || medioPago === 'TRANSFERENCIA' || medioPago === 'FIADO';
}

/** 41 si todo es exento; 39 en otro caso (la 39 admite líneas exentas en `MntExe`). */
export function tipoDteSegunTotales(totales: TotalesDocumento): TipoDte {
  return totales.afectoClp === 0 && totales.exentoClp > 0 ? 41 : 39;
}

/** Revisa que la venta cuadre antes de emitir: nada tributario sale con montos inconsistentes. */
export function validarVentaParaDte(venta: VentaParaDte): void {
  const { totales, lineas } = venta;
  const suma = (tipo: 'AFECTO' | 'EXENTO'): number =>
    lineas.filter((l) => l.tipoImpuesto === tipo).reduce((s, l) => s + l.montoClp, 0);

  if (lineas.length === 0) throw new ErrorDominio('VENTA_VACIA', 'La venta no tiene líneas');
  if (suma('AFECTO') !== totales.afectoClp || suma('EXENTO') !== totales.exentoClp) {
    throw new ErrorDominio('TOTALES_DESCUADRADOS', 'Las líneas no suman los totales de la venta');
  }
  if (
    totales.netoClp + totales.ivaClp !== totales.afectoClp ||
    totales.afectoClp + totales.exentoClp !== totales.totalClp
  ) {
    throw new ErrorDominio('TOTALES_DESCUADRADOS', 'Neto + IVA + exento no cuadra con el total');
  }
}

/**
 * Pasos comunes antes de emitir: valida montos y decide si corresponde documento.
 * Devuelve el motivo para no emitir, o `null` si hay que emitir.
 */
export function motivoParaNoEmitir(
  venta: VentaParaDte,
  modelo: ModeloEmision,
): 'VOUCHER_ES_BOLETA' | 'TOTAL_CERO' | null {
  validarVentaParaDte(venta);
  if (venta.totales.totalClp === 0) return 'TOTAL_CERO';
  if (!requiereBoleta(modelo, venta.medioPago)) return 'VOUCHER_ES_BOLETA';
  return null;
}
