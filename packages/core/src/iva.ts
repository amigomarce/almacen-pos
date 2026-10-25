import { asegurarEntero, dividirRedondeado, multiplicarSeguro } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';

/**
 * Tasa general de IVA (DL 825, art. 14). Vigente 19 % al 2026-10-25 según fuentes
 * secundarias; confirmar contra sii.cl si cambia la ley. Ver ADR-003.
 */
export const TASA_IVA_PORCENTAJE = 19;

export type TipoImpuesto = 'AFECTO' | 'EXENTO';

export interface DesgloseIva {
  neto: Clp;
  iva: Clp;
  /** Igual al monto con IVA recibido: neto + iva === total siempre. */
  total: Clp;
}

function validarTasa(tasa: number): void {
  if (!Number.isInteger(tasa) || tasa < 0 || tasa > 100) {
    throw new ErrorDominio('TASA_INVALIDA', `Tasa de IVA inválida: ${tasa}`);
  }
}

/**
 * Separa neto e IVA de un monto con IVA incluido (ADR-003):
 * `neto = round(total × 100 / (100 + tasa))` (half-up) e `iva = total − neto`.
 * Se aplica UNA vez sobre el total afecto del documento, no por línea.
 */
export function desglosarIva(totalConIva: Clp, tasa: number = TASA_IVA_PORCENTAJE): DesgloseIva {
  asegurarEntero(totalConIva, 'totalConIva');
  validarTasa(tasa);
  if (totalConIva < 0) {
    throw new ErrorDominio('MONTO_NEGATIVO', 'El monto con IVA no puede ser negativo');
  }
  const neto = dividirRedondeado(multiplicarSeguro(totalConIva, 100), 100 + tasa);
  return { neto, iva: totalConIva - neto, total: totalConIva };
}

export interface LineaParaTotales {
  tipoImpuesto: TipoImpuesto;
  /** Total de la línea con IVA incluido (ya con descuentos). */
  montoClp: Clp;
}

export interface TotalesDocumento {
  /** Suma de líneas afectas, con IVA incluido. */
  afectoClp: Clp;
  netoClp: Clp;
  ivaClp: Clp;
  exentoClp: Clp;
  /** afecto + exento = neto + iva + exento. Sin redondeo de efectivo. */
  totalClp: Clp;
  tasaIva: number;
}

export function calcularTotalesDocumento(
  lineas: readonly LineaParaTotales[],
  tasa: number = TASA_IVA_PORCENTAJE,
): TotalesDocumento {
  let afecto = 0;
  let exento = 0;
  for (const l of lineas) {
    asegurarEntero(l.montoClp, 'montoClp');
    if (l.montoClp < 0) {
      throw new ErrorDominio('MONTO_NEGATIVO', 'Una línea no puede tener monto negativo');
    }
    if (l.tipoImpuesto === 'AFECTO') afecto += l.montoClp;
    else exento += l.montoClp;
  }
  asegurarEntero(afecto + exento, 'total');
  const { neto, iva } = desglosarIva(afecto, tasa);
  return {
    afectoClp: afecto,
    netoClp: neto,
    ivaClp: iva,
    exentoClp: exento,
    totalClp: afecto + exento,
    tasaIva: tasa,
  };
}
