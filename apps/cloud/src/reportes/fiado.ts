/** Reporte de fiado para el dueño (ADR-022): quién debe, cuánto y cuándo abonó por última vez. */

export interface ClienteFiadoFila {
  id: string;
  name: string;
  phone: string | null;
  creditLimitClp: number | null;
  active: boolean;
}

export interface MovimientoFiadoFila {
  customerId: string;
  type: string;
  amountClp: number;
  createdAt: Date;
}

export interface DeudorFiado {
  id: string;
  nombre: string;
  telefono: string | null;
  saldoClp: number;
  limiteClp: number | null;
  /** Saldo por sobre el límite (pasó con la clave del dueño). */
  sobreLimite: boolean;
  ultimoAbono: string | null;
  ultimoMovimiento: string | null;
}

export interface ReporteFiado {
  /** Suma de lo que deben todos los vecinos. */
  totalClp: number;
  deudores: DeudorFiado[];
}

/** Solo vecinos con deuda, del que más debe al que menos. */
export function resumirFiado(
  clientes: readonly ClienteFiadoFila[],
  movimientos: readonly MovimientoFiadoFila[],
): ReporteFiado {
  const porCliente = new Map<string, { saldo: number; abono: Date | null; ultimo: Date | null }>();
  for (const m of movimientos) {
    const a = porCliente.get(m.customerId) ?? { saldo: 0, abono: null, ultimo: null };
    a.saldo += m.amountClp;
    if (m.type === 'ABONO' && (!a.abono || m.createdAt > a.abono)) a.abono = m.createdAt;
    if (!a.ultimo || m.createdAt > a.ultimo) a.ultimo = m.createdAt;
    porCliente.set(m.customerId, a);
  }
  const deudores = clientes
    .map((c) => {
      const a = porCliente.get(c.id);
      const saldo = a?.saldo ?? 0;
      return {
        id: c.id,
        nombre: c.name,
        telefono: c.phone,
        saldoClp: saldo,
        limiteClp: c.creditLimitClp,
        sobreLimite: c.creditLimitClp !== null && saldo > c.creditLimitClp,
        ultimoAbono: a?.abono?.toISOString() ?? null,
        ultimoMovimiento: a?.ultimo?.toISOString() ?? null,
      };
    })
    .filter((d) => d.saldoClp > 0)
    .sort((x, y) => y.saldoClp - x.saldoClp || x.nombre.localeCompare(y.nombre));
  return { totalClp: deudores.reduce((s, d) => s + d.saldoClp, 0), deudores };
}
