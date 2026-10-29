import type { ClienteFiadoFila, MovimientoFiadoFila } from './fiado.js';
import type { DevolucionReporte, LineaReporte, ProductoReporte, VentaReporte } from './analisis.js';

export interface ResumenVentas {
  /** Ventas netas: lo vendido menos lo devuelto en el período. */
  totalClp: number;
  cantidad: number;
  porMedio: Record<string, number>;
  /** Devoluciones parciales del período (ADR-021). */
  devolucionesClp: number;
}

export interface ProductoStockBajo {
  id: string;
  name: string;
  unit: string;
  stockQtyMilli: number;
  stockMinMilli: number | null;
}

/**
 * Agrega filas de ventas en total, cantidad y desglose por medio de pago. Las devoluciones del
 * período se restan del total y de su medio de pago (ventas netas).
 */
export function resumirVentas(
  filas: readonly { totalClp: number; paymentMethod: string }[],
  devoluciones: readonly { refundClp: number; paymentMethod: string }[] = [],
): ResumenVentas {
  const porMedio: Record<string, number> = {};
  let totalClp = 0;
  for (const f of filas) {
    totalClp += f.totalClp;
    porMedio[f.paymentMethod] = (porMedio[f.paymentMethod] ?? 0) + f.totalClp;
  }
  let devolucionesClp = 0;
  for (const d of devoluciones) {
    devolucionesClp += d.refundClp;
    totalClp -= d.refundClp;
    porMedio[d.paymentMethod] = (porMedio[d.paymentMethod] ?? 0) - d.refundClp;
  }
  return { totalClp, cantidad: filas.length, porMedio, devolucionesClp };
}

/** Calcula el saldo por producto y devuelve los que están bajo su mínimo (más crítico primero). */
export function calcularStockBajo(
  productos: readonly {
    id: string;
    name: string;
    unit: string;
    stockMinMilli: number | null;
  }[],
  movimientos: readonly { productId: string; qty: number }[],
): ProductoStockBajo[] {
  const saldo = new Map<string, number>();
  for (const m of movimientos) saldo.set(m.productId, (saldo.get(m.productId) ?? 0) + m.qty);
  return productos
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      stockQtyMilli: saldo.get(p.id) ?? 0,
      stockMinMilli: p.stockMinMilli,
    }))
    .filter((p) => p.stockQtyMilli < (p.stockMinMilli ?? 0))
    .sort((a, b) => a.stockQtyMilli - b.stockQtyMilli);
}

export interface DatosReporte {
  ventas: VentaReporte[];
  lineas: LineaReporte[];
  devoluciones: DevolucionReporte[];
  productos: ProductoReporte[];
}

export interface RepoReportes {
  /** Ventas OK desde `desde` (total, cantidad y desglose por medio de pago). */
  resumenVentas(ownerId: string, desde: Date): Promise<ResumenVentas>;
  /** Productos con stock bajo su mínimo, ordenados por el más crítico primero. */
  stockBajo(ownerId: string): Promise<ProductoStockBajo[]>;
  /** Último cierre de caja subido por la caja (para el aviso en el móvil). */
  ultimoCierre(ownerId: string): Promise<CierrePublico | null>;
  /** Vecinos y movimientos de su cuenta corriente (fiado, ADR-022). */
  datosFiado(
    ownerId: string,
  ): Promise<{ clientes: ClienteFiadoFila[]; movimientos: MovimientoFiadoFila[] }>;
  /** Filas del período para los reportes (ventas OK, líneas, devoluciones y productos). */
  datosReporte(ownerId: string, desde: Date): Promise<DatosReporte>;
}

export interface CierrePublico {
  id: string;
  registerId: string;
  registerName: string | null;
  closedAt: string;
  countedCashClp: number;
  expectedCashClp: number;
  differenceClp: number;
  totalVentasClp: number;
  cantidadVentas: number;
}
