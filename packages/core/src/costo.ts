import { asegurarEntero, dividirRedondeado, multiplicarSeguro } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';

/**
 * Costo promedio ponderado al recibir mercadería:
 * (stock × costo actual + recibido × costo nuevo) / (stock + recibido), half-up a peso entero.
 * - Sin costo previo, o con stock en 0 o negativo, el costo pasa a ser el nuevo.
 * - Cantidades en milésimas (ADR-002); costos por unidad o por kg, con IVA o sin IVA, pero
 *   siempre del mismo modo (lo decide quien ingresa los costos).
 */
export function costoPromedio(
  stockActualMilli: number,
  costoActualClp: Clp | null,
  recibidoMilli: number,
  costoNuevoClp: Clp,
): Clp {
  asegurarEntero(stockActualMilli, 'stock actual');
  asegurarEntero(recibidoMilli, 'cantidad recibida');
  asegurarEntero(costoNuevoClp, 'costo nuevo');
  if (recibidoMilli <= 0)
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'La cantidad recibida debe ser mayor a 0');
  if (costoNuevoClp < 0) throw new ErrorDominio('COSTO_NEGATIVO', 'El costo no puede ser negativo');
  if (costoActualClp === null || stockActualMilli <= 0) return costoNuevoClp;
  asegurarEntero(costoActualClp, 'costo actual');
  const total =
    multiplicarSeguro(stockActualMilli, costoActualClp) +
    multiplicarSeguro(recibidoMilli, costoNuevoClp);
  return dividirRedondeado(total, stockActualMilli + recibidoMilli);
}

/** Margen sobre el precio de venta, en porcentaje entero (puede ser negativo). `null` sin costo. */
export function margenPorcentaje(precioClp: Clp, costoClp: Clp | null): number | null {
  if (costoClp === null || precioClp <= 0) return null;
  asegurarEntero(precioClp, 'precio');
  asegurarEntero(costoClp, 'costo');
  return dividirRedondeado((precioClp - costoClp) * 100, precioClp);
}
