export interface ResumenVentas {
  totalClp: number;
  cantidad: number;
  porMedio: Record<string, number>;
}

export interface ProductoStockBajo {
  id: string;
  name: string;
  unit: string;
  stockQtyMilli: number;
  stockMinMilli: number | null;
}

/** Agrega filas de ventas en total, cantidad y desglose por medio de pago. */
export function resumirVentas(
  filas: readonly { totalClp: number; paymentMethod: string }[],
): ResumenVentas {
  const porMedio: Record<string, number> = {};
  let totalClp = 0;
  for (const f of filas) {
    totalClp += f.totalClp;
    porMedio[f.paymentMethod] = (porMedio[f.paymentMethod] ?? 0) + f.totalClp;
  }
  return { totalClp, cantidad: filas.length, porMedio };
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

export interface RepoReportes {
  /** Ventas OK desde `desde` (total, cantidad y desglose por medio de pago). */
  resumenVentas(ownerId: string, desde: Date): Promise<ResumenVentas>;
  /** Productos con stock bajo su mínimo, ordenados por el más crítico primero. */
  stockBajo(ownerId: string): Promise<ProductoStockBajo[]>;
}
