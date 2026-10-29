/**
 * Devolución parcial de una venta (ADR-021): el cliente trae de vuelta algunos productos. Se
 * repone el stock, se devuelve lo proporcional a lo pagado por cada línea (por el mismo medio
 * de pago) y queda registrado en el turno abierto. Nada se borra.
 */
import {
  calcularDevolucion,
  formatearClp,
  type ItemDevolucion,
  type MedioPago,
} from '@almacen/core';
import type { DevolucionWire } from '@almacen/sync';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  cashSessions,
  products,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  stockMovements,
  taxDocuments,
  users,
} from '../db/schema.js';
import { leerConfiguracion } from '../configuracion/servicio.js';
import { ErrorHttp } from '../errores.js';
import { movimientoAWire } from '../sincronizacion/mapping.js';
import { encolar } from '../sincronizacion/outbox.js';

export interface DevolucionRegistrada {
  id: string;
  ventaId: string;
  creadaEn: string;
  totalClp: number;
  redondeoClp: number;
  /** Lo que se entregó al cliente (total + redondeo). */
  aEntregarClp: number;
  medioPago: MedioPago;
  motivo: string;
  autorizadaPor: { id: string; name: string };
  items: { lineaId: string; nombre: string; cantidadMilli: number; montoClp: number }[];
}

export interface ResultadoDevolucion {
  devolucion: DevolucionRegistrada;
  /** Qué hacer fuera del sistema (nota de crédito, reversar el pago con tarjeta). */
  recordatorio: string | null;
}

function nombreUsuario(db: Db, id: string): { id: string; name: string } {
  const u = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).get();
  return u ?? { id, name: '?' };
}

/** Lo ya devuelto por línea de una venta. */
export function devueltoPorLinea(
  db: Db,
  ventaId: string,
): Map<string, { milli: number; clp: number }> {
  const filas = db
    .select({
      lineaId: saleReturnItems.saleItemId,
      milli: sql<number>`sum(${saleReturnItems.qtyMilli})`,
      clp: sql<number>`sum(${saleReturnItems.amountClp})`,
    })
    .from(saleReturnItems)
    .innerJoin(saleReturns, eq(saleReturns.id, saleReturnItems.returnId))
    .where(eq(saleReturns.saleId, ventaId))
    .groupBy(saleReturnItems.saleItemId)
    .all();
  return new Map(filas.map((f) => [f.lineaId, { milli: f.milli, clp: f.clp }]));
}

/** Devoluciones de una venta, de la más antigua a la más nueva. */
export function devolucionesDeVenta(db: Db, ventaId: string): DevolucionRegistrada[] {
  const devs = db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.saleId, ventaId))
    .orderBy(saleReturns.createdAt)
    .all();
  if (devs.length === 0) return [];
  const items = db
    .select({
      returnId: saleReturnItems.returnId,
      lineaId: saleReturnItems.saleItemId,
      nombre: saleItems.nameSnapshot,
      cantidadMilli: saleReturnItems.qtyMilli,
      montoClp: saleReturnItems.amountClp,
    })
    .from(saleReturnItems)
    .innerJoin(saleItems, eq(saleItems.id, saleReturnItems.saleItemId))
    .where(
      inArray(
        saleReturnItems.returnId,
        devs.map((d) => d.id),
      ),
    )
    .all();
  return devs.map((d) => ({
    id: d.id,
    ventaId: d.saleId,
    creadaEn: d.createdAt.toISOString(),
    totalClp: d.refundClp,
    redondeoClp: d.roundingClp,
    aEntregarClp: d.refundClp + d.roundingClp,
    medioPago: d.paymentMethod as MedioPago,
    motivo: d.reason,
    autorizadaPor: nombreUsuario(db, d.authorizedBy),
    items: items
      .filter((i) => i.returnId === d.id)
      .map(({ lineaId, nombre, cantidadMilli, montoClp }) => ({
        lineaId,
        nombre,
        cantidadMilli,
        montoClp,
      })),
  }));
}

/** Devoluciones hechas en un turno (para cuadrar la caja). */
export function devolucionesDeSesion(
  db: Db,
  sesionId: string,
): { medioPago: MedioPago; totalClp: number; redondeoClp: number }[] {
  return db
    .select({
      medioPago: saleReturns.paymentMethod,
      totalClp: saleReturns.refundClp,
      redondeoClp: saleReturns.roundingClp,
    })
    .from(saleReturns)
    .where(eq(saleReturns.cashSessionId, sesionId))
    .all()
    .map((d) => ({ ...d, medioPago: d.medioPago as MedioPago }));
}

/**
 * Registra una devolución parcial. La venta debe estar vigente (no anulada) y la caja abierta:
 * si se devuelve efectivo, sale del cajón de este turno.
 */
export function registrarDevolucion(
  db: Db,
  datos: {
    ventaId: string;
    registerId: string;
    items: ItemDevolucion[];
    motivo: string;
    autorizadaPorId: string;
    usuarioId: string;
  },
): ResultadoDevolucion {
  const motivo = datos.motivo.trim();
  const id = db.transaction(() => {
    const v = db.select().from(sales).where(eq(sales.id, datos.ventaId)).get();
    if (!v) throw new ErrorHttp('NO_ENCONTRADO', 'Venta no encontrada', 404);
    if (v.status === 'ANULADA') {
      throw new ErrorHttp('YA_ANULADA', 'La venta está anulada: no hay nada que devolver', 409);
    }
    const sesion = db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.registerId, datos.registerId), isNull(cashSessions.closedAt)))
      .get();
    if (!sesion) {
      throw new ErrorHttp('CAJA_CERRADA', 'Abre la caja para hacer una devolución', 409);
    }
    const lineas = db.select().from(saleItems).where(eq(saleItems.saleId, v.id)).all();
    const devuelto = devueltoPorLinea(db, v.id);
    const medioPago = v.paymentMethod as MedioPago;
    const calculo = calcularDevolucion(
      lineas.map((l) => ({
        id: l.id,
        cantidadMilli: l.qtyMilli,
        totalLineaClp: l.lineTotalClp,
        devueltoMilli: devuelto.get(l.id)?.milli ?? 0,
        devueltoClp: devuelto.get(l.id)?.clp ?? 0,
      })),
      datos.items,
      medioPago,
      leerConfiguracion(db).cashRoundingEnabled,
    );
    const ahora = new Date();
    const dev = db
      .insert(saleReturns)
      .values({
        saleId: v.id,
        cashSessionId: sesion.id,
        refundClp: calculo.totalClp,
        roundingClp: calculo.redondeoClp,
        paymentMethod: medioPago,
        reason: motivo,
        authorizedBy: datos.autorizadaPorId,
        userId: datos.usuarioId,
        createdAt: ahora,
      })
      .returning()
      .get();
    const wireItems: DevolucionWire['items'] = [];
    for (const item of calculo.items) {
      const l = lineas.find((x) => x.id === item.lineaId);
      /* v8 ignore next -- calcularDevolucion ya validó que la línea existe */
      if (!l) continue;
      db.insert(saleReturnItems)
        .values({
          returnId: dev.id,
          saleItemId: l.id,
          qtyMilli: item.cantidadMilli,
          amountClp: item.montoClp,
        })
        .run();
      wireItems.push({
        saleItemId: l.id,
        productId: l.productId,
        nameSnapshot: l.nameSnapshot,
        qtyMilli: item.cantidadMilli,
        amountClp: item.montoClp,
      });
      // Venta rápida sin producto: no hay stock que reponer.
      if (!l.productId) continue;
      // Mismo tipo que una anulación (es una reversión de la venta); refId = la devolución.
      const m = db
        .insert(stockMovements)
        .values({
          productId: l.productId,
          qtyMilli: item.cantidadMilli,
          type: 'ANULACION',
          refId: dev.id,
          userId: datos.usuarioId,
          at: ahora,
        })
        .returning()
        .get();
      encolar(db, {
        entity: 'stock_movements',
        entityId: m.id,
        op: 'INSERT',
        payload: movimientoAWire(m),
      });
      db.update(products)
        .set({ stockQtyMilli: sql`${products.stockQtyMilli} + ${item.cantidadMilli}` })
        .where(eq(products.id, l.productId))
        .run();
    }
    encolar(db, {
      entity: 'sale_returns',
      entityId: dev.id,
      op: 'INSERT',
      payload: {
        id: dev.id,
        saleId: v.id,
        registerId: v.registerId,
        refundClp: dev.refundClp,
        roundingClp: dev.roundingClp,
        paymentMethod: medioPago,
        reason: motivo,
        createdAt: ahora.toISOString(),
        items: wireItems,
      } satisfies DevolucionWire,
    });
    return dev.id;
  });
  const devolucion = devolucionesDeVenta(db, datos.ventaId).find((d) => d.id === id);
  /* v8 ignore next -- se acaba de registrar */
  if (!devolucion) throw new Error('Devolución no encontrada');
  return { devolucion, recordatorio: recordatorioDevolucion(db, devolucion) };
}

// TODO(SII): confirmar el procedimiento de nota de crédito por devolución parcial (ADR-001 §5).
function recordatorioDevolucion(db: Db, d: DevolucionRegistrada): string | null {
  const monto = formatearClp(d.totalClp);
  const doc = db
    .select({
      provider: taxDocuments.provider,
      folio: taxDocuments.folio,
      ext: taxDocuments.folioExterno,
    })
    .from(taxDocuments)
    .where(eq(taxDocuments.saleId, d.ventaId))
    .get();
  const partes: string[] = [];
  if (doc?.provider === 'SII_DIRECTO') {
    partes.push(
      `Emite una nota de crédito electrónica por ${monto} que referencie la boleta folio ${doc.folio ?? '?'}`,
    );
  } else if (doc?.provider === 'PUENTE_MANUAL') {
    partes.push(
      doc.ext
        ? `Emite en sii.cl una nota de crédito por ${monto} que referencie la boleta folio ${doc.ext}`
        : `Si emitiste la boleta en e-Boleta, emite en sii.cl una nota de crédito por ${monto}`,
    );
  }
  if (d.medioPago === 'DEBITO' || d.medioPago === 'CREDITO') {
    partes.push(`devuelve ${monto} en la máquina de tarjetas`);
  } else if (d.medioPago === 'TRANSFERENCIA') {
    partes.push(`devuelve ${monto} por transferencia`);
  } else {
    partes.push(`entrega ${formatearClp(d.aEntregarClp)} en efectivo`);
  }
  const texto = partes.join(' y ');
  return texto.charAt(0).toUpperCase() + texto.slice(1) + '.';
}
