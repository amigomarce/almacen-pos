import { asegurarEntero, dividirRedondeado, multiplicarSeguro } from './aritmetica.js';
import type { Clp } from './dinero.js';
import { ErrorDominio } from './errores.js';
import {
  calcularTotalesDocumento,
  TASA_IVA_PORCENTAJE,
  type TipoImpuesto,
  type TotalesDocumento,
} from './iva.js';

export type Unidad = 'UN' | 'KG';

/** 1 unidad o 1 kg expresado en milésimas (ADR-002). */
export const MILI = 1000;

export interface LineaVentaEntrada {
  /** `null` para ventas rápidas sin producto (ej. "Pan $1.000"). */
  productoId: string | null;
  nombre: string;
  unidad: Unidad;
  /** Milésimas: 3 unidades = 3000; 1,250 kg = 1250. */
  cantidadMilli: number;
  /** Precio con IVA por unidad o por kg. */
  precioUnitarioClp: Clp;
  tipoImpuesto: TipoImpuesto;
  descuentoManualClp?: Clp;
  /**
   * Solo por peso: el monto se cobra exacto (venta "por monto" o etiqueta de balanza con
   * precio) y `cantidadMilli` es el peso estimado para el stock (ADR-006).
   */
  subtotalFijoClp?: Clp;
}

/** "N x $P": por ejemplo 2 x $1.500. Solo productos por unidad. */
export interface Promocion {
  productoId: string;
  cantidadPack: number;
  precioPackClp: Clp;
}

export interface LineaVentaCalculada extends LineaVentaEntrada {
  subtotalClp: Clp;
  descuentoManualClp: Clp;
  descuentoPromoClp: Clp;
  totalLineaClp: Clp;
}

export interface ResultadoVenta {
  lineas: LineaVentaCalculada[];
  descuentoTotalClp: Clp;
  /** Total a pagar con IVA incluido, SIN redondeo de efectivo. */
  totalClp: Clp;
  totales: TotalesDocumento;
}

/**
 * Peso estimado (milésimas de kg) para un monto pedido: "$1.000 de pan" a $1.990/kg → 503 g.
 * Half-up, mínimo 1 g. Solo sirve para el stock: el monto se cobra exacto (ADR-006).
 */
export function estimarCantidadPorMonto(montoClp: Clp, precioPorKgClp: Clp): number {
  asegurarEntero(montoClp, 'monto');
  asegurarEntero(precioPorKgClp, 'precio por kg');
  if (montoClp <= 0) throw new ErrorDominio('MONTO_INVALIDO', 'El monto debe ser mayor a $0');
  if (precioPorKgClp <= 0) {
    throw new ErrorDominio('PRECIO_INVALIDO', 'El producto no tiene precio por kg');
  }
  return Math.max(1, dividirRedondeado(multiplicarSeguro(montoClp, MILI), precioPorKgClp));
}

/** Monto de una línea: round(cantidadMilli × precio / 1000), half-up a peso entero. */
export function calcularSubtotalLinea(cantidadMilli: number, precioUnitarioClp: Clp): Clp {
  return dividirRedondeado(multiplicarSeguro(cantidadMilli, precioUnitarioClp), MILI);
}

function validarLinea(l: LineaVentaEntrada, i: number): void {
  const donde = `línea ${i + 1}`;
  if (l.nombre.trim() === '') throw new ErrorDominio('NOMBRE_VACIO', `${donde}: falta el nombre`);
  asegurarEntero(l.cantidadMilli, `${donde}: cantidad`);
  asegurarEntero(l.precioUnitarioClp, `${donde}: precio`);
  if (l.cantidadMilli <= 0) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', `${donde}: la cantidad debe ser mayor a 0`);
  }
  if (l.unidad === 'UN' && l.cantidadMilli % MILI !== 0) {
    throw new ErrorDominio(
      'CANTIDAD_FRACCIONARIA',
      `${donde}: un producto por unidad no admite fracciones`,
    );
  }
  if (l.precioUnitarioClp < 0) {
    throw new ErrorDominio('PRECIO_NEGATIVO', `${donde}: el precio no puede ser negativo`);
  }
  if (l.subtotalFijoClp !== undefined) {
    asegurarEntero(l.subtotalFijoClp, `${donde}: monto`);
    if (l.unidad !== 'KG') {
      throw new ErrorDominio(
        'MONTO_SOLO_KG',
        `${donde}: solo los productos por peso se venden por monto`,
      );
    }
    if (l.subtotalFijoClp <= 0) {
      throw new ErrorDominio('MONTO_INVALIDO', `${donde}: el monto debe ser mayor a $0`);
    }
  }
}

function validarPromociones(promociones: readonly Promocion[]): Map<string, Promocion> {
  const porProducto = new Map<string, Promocion>();
  for (const p of promociones) {
    if (!Number.isSafeInteger(p.cantidadPack) || p.cantidadPack < 2) {
      throw new ErrorDominio(
        'PROMO_INVALIDA',
        `Promoción de ${p.productoId}: el pack debe ser ≥ 2`,
      );
    }
    asegurarEntero(p.precioPackClp, 'precioPackClp');
    if (p.precioPackClp < 0) {
      throw new ErrorDominio('PROMO_INVALIDA', `Promoción de ${p.productoId}: precio negativo`);
    }
    if (porProducto.has(p.productoId)) {
      throw new ErrorDominio('PROMO_DUPLICADA', `Hay más de una promoción para ${p.productoId}`);
    }
    porProducto.set(p.productoId, p);
  }
  return porProducto;
}

/**
 * Descuento de una promoción "N x $P" sobre las líneas de un mismo producto.
 * Las unidades que no completan un pack se cobran a precio normal. Si el pack sale más caro
 * que el precio normal, la promoción no se aplica. El descuento se asigna a las líneas en
 * orden, sin dejar ninguna en negativo.
 */
function aplicarPromocion(lineas: LineaVentaCalculada[], promo: Promocion): void {
  const unidadesTotales = lineas.reduce((s, l) => s + l.cantidadMilli / MILI, 0);
  const packs = Math.floor(unidadesTotales / promo.cantidadPack);
  if (packs === 0) return;

  let unidadesPorConsumir = packs * promo.cantidadPack;
  let valorNormal = 0;
  for (const l of lineas) {
    const usadas = Math.min(unidadesPorConsumir, l.cantidadMilli / MILI);
    valorNormal += multiplicarSeguro(usadas, l.precioUnitarioClp);
    unidadesPorConsumir -= usadas;
  }
  let descuento = valorNormal - multiplicarSeguro(packs, promo.precioPackClp);
  for (const l of lineas) {
    if (descuento <= 0) break;
    const disponible = l.subtotalClp - l.descuentoManualClp;
    const asignado = Math.min(disponible, descuento);
    l.descuentoPromoClp = asignado;
    l.totalLineaClp -= asignado;
    descuento -= asignado;
  }
}

/** Calcula líneas, descuentos y totales de una venta. Función pura: no toca stock ni DB. */
export function calcularVenta(
  entradas: readonly LineaVentaEntrada[],
  promociones: readonly Promocion[] = [],
  tasaIva: number = TASA_IVA_PORCENTAJE,
): ResultadoVenta {
  const promosPorProducto = validarPromociones(promociones);

  const lineas = entradas.map((entrada, i): LineaVentaCalculada => {
    validarLinea(entrada, i);
    const subtotal =
      entrada.subtotalFijoClp ??
      calcularSubtotalLinea(entrada.cantidadMilli, entrada.precioUnitarioClp);
    const manual = entrada.descuentoManualClp ?? 0;
    asegurarEntero(manual, `línea ${i + 1}: descuento`);
    if (manual < 0 || manual > subtotal) {
      throw new ErrorDominio(
        'DESCUENTO_INVALIDO',
        `línea ${i + 1}: el descuento debe estar entre $0 y el subtotal`,
      );
    }
    return {
      ...entrada,
      subtotalClp: subtotal,
      descuentoManualClp: manual,
      descuentoPromoClp: 0,
      totalLineaClp: subtotal - manual,
    };
  });

  for (const [productoId, promo] of promosPorProducto) {
    const delProducto = lineas.filter((l) => l.productoId === productoId && l.unidad === 'UN');
    aplicarPromocion(delProducto, promo);
  }

  const totales = calcularTotalesDocumento(
    lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.totalLineaClp })),
    tasaIva,
  );
  const descuentoTotal = lineas.reduce((s, l) => s + l.descuentoManualClp + l.descuentoPromoClp, 0);
  return { lineas, descuentoTotalClp: descuentoTotal, totalClp: totales.totalClp, totales };
}
