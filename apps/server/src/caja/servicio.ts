import {
  cuadrarCaja,
  diferenciaCaja,
  ErrorDominio,
  validarMovimientoEfectivo,
  type CuadraturaCaja,
  type MedioPago,
  type TipoMovimientoEfectivo,
} from '@almacen/core';
import type { CierreCajaWire } from '@almacen/sync';
import { and, asc, count, eq, isNull, max } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  cashMovements,
  cashSessions,
  registers,
  sales,
  unexpectedShutdowns,
  users,
} from '../db/schema.js';
import { encolar } from '../sincronizacion/outbox.js';
import { devolucionesDeSesion } from '../ventas/devoluciones.js';

export interface Caja {
  id: string;
  name: string;
}

export interface SesionCaja {
  id: string;
  registerId: string;
  abiertaPor: { id: string; name: string };
  abiertaEn: string;
  efectivoInicialClp: number;
  cerradaPor: { id: string; name: string } | null;
  cerradaEn: string | null;
  efectivoContadoClp: number | null;
  efectivoEsperadoClp: number | null;
  /** Contado − esperado. Solo en sesiones cerradas. */
  diferenciaClp: number | null;
  /**
   * Veces que la app se cerró sin el cierre de caja durante este turno (cierre forzado o corte
   * de luz) y la última (ADR-019).
   */
  cierresInesperados: { cantidad: number; ultimo: string | null };
}

/** Retiro o ingreso de efectivo del turno (no es una venta). */
export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoEfectivo;
  montoClp: number;
  motivo: string;
  usuario: { id: string; name: string };
  creadoEn: string;
}

export interface SesionConResumen {
  sesion: SesionCaja;
  resumen: CuadraturaCaja;
  /** Retiros e ingresos del turno, en orden. */
  movimientos: MovimientoCaja[];
}

type FilaSesion = typeof cashSessions.$inferSelect;

/** La caja de este equipo: la indicada, o la primera activa (un local tiene 1–2 cajas). */
export function buscarCaja(db: Db, registerId?: string): Caja | null {
  const fila = db
    .select({ id: registers.id, name: registers.name })
    .from(registers)
    .where(
      registerId
        ? and(eq(registers.id, registerId), eq(registers.active, true))
        : eq(registers.active, true),
    )
    .orderBy(asc(registers.name))
    .get();
  return fila ?? null;
}

function nombreUsuario(db: Db, id: string): { id: string; name: string } {
  const u = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).get();
  return u ?? { id, name: '?' };
}

function aSesion(db: Db, f: FilaSesion): SesionCaja {
  return {
    id: f.id,
    registerId: f.registerId,
    abiertaPor: nombreUsuario(db, f.openedBy),
    abiertaEn: f.openedAt.toISOString(),
    efectivoInicialClp: f.openingCash,
    cerradaPor: f.closedBy ? nombreUsuario(db, f.closedBy) : null,
    cerradaEn: f.closedAt?.toISOString() ?? null,
    efectivoContadoClp: f.countedCash,
    efectivoEsperadoClp: f.expectedCash,
    diferenciaClp:
      f.countedCash !== null && f.expectedCash !== null ? f.countedCash - f.expectedCash : null,
    cierresInesperados: cierresInesperados(db, f.id),
  };
}

function cierresInesperados(db: Db, sesionId: string): SesionCaja['cierresInesperados'] {
  const fila = db
    .select({ cantidad: count(), ultimo: max(unexpectedShutdowns.detectedAt) })
    .from(unexpectedShutdowns)
    .where(eq(unexpectedShutdowns.cashSessionId, sesionId))
    .get();
  const ultimo = fila?.ultimo;
  return {
    cantidad: fila?.cantidad ?? 0,
    ultimo: ultimo ? new Date(Number(ultimo)).toISOString() : null,
  };
}

/**
 * La app de escritorio avisa al arrancar que la vez anterior terminó sin salida limpia. Se
 * anota en cada turno que seguía abierto; sin turno abierto no hay nada que anotar. Devuelve
 * cuántos turnos quedaron registrados.
 */
export function registrarCierreInesperado(db: Db, detectadoEn = new Date()): number {
  const abiertas = db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(isNull(cashSessions.closedAt))
    .all();
  for (const s of abiertas) {
    db.insert(unexpectedShutdowns).values({ cashSessionId: s.id, detectedAt: detectadoEn }).run();
  }
  return abiertas.length;
}

/**
 * ¿Hay algún turno de caja sin cerrar en este equipo? Mientras lo haya, la app de escritorio
 * no se puede cerrar de ninguna forma (ADR-019).
 */
export function hayCajaAbierta(db: Db): boolean {
  return (
    db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(isNull(cashSessions.closedAt))
      .get() !== undefined
  );
}

function filaAbierta(db: Db, registerId: string): FilaSesion | undefined {
  return db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.registerId, registerId), isNull(cashSessions.closedAt)))
    .get();
}

function movimientosDe(db: Db, sesionId: string): MovimientoCaja[] {
  return db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.cashSessionId, sesionId))
    .orderBy(asc(cashMovements.createdAt))
    .all()
    .map((m) => ({
      id: m.id,
      tipo: m.type,
      montoClp: m.amountClp,
      motivo: m.reason,
      usuario: nombreUsuario(db, m.userId),
      creadoEn: m.createdAt.toISOString(),
    }));
}

/** Sesión con su resumen y sus movimientos de efectivo. */
function completa(db: Db, f: FilaSesion): SesionConResumen {
  const movimientos = movimientosDe(db, f.id);
  return { sesion: aSesion(db, f), resumen: resumir(db, f, movimientos), movimientos };
}

function resumir(db: Db, f: FilaSesion, movimientos = movimientosDe(db, f.id)): CuadraturaCaja {
  const ventas = db
    .select({
      medioPago: sales.paymentMethod,
      totalClp: sales.totalClp,
      redondeoClp: sales.roundingClp,
      status: sales.status,
    })
    .from(sales)
    .where(eq(sales.cashSessionId, f.id))
    .all();
  return cuadrarCaja(
    f.openingCash,
    ventas.map((v) => ({
      // La columna tiene un CHECK con los mismos valores de MEDIOS_PAGO.
      medioPago: v.medioPago as MedioPago,
      totalClp: v.totalClp,
      redondeoClp: v.redondeoClp,
      anulada: v.status === 'ANULADA',
    })),
    movimientos.map((m) => ({ tipo: m.tipo, montoClp: m.montoClp })),
    devolucionesDeSesion(db, f.id),
  );
}

export function sesionAbierta(db: Db, registerId: string): SesionConResumen | null {
  const f = filaAbierta(db, registerId);
  return f ? completa(db, f) : null;
}

export function sesionPorId(db: Db, id: string): SesionConResumen | null {
  const f = db.select().from(cashSessions).where(eq(cashSessions.id, id)).get();
  return f ? completa(db, f) : null;
}

export type ResultadoApertura =
  | { ok: true; datos: SesionConResumen }
  | { ok: false; error: 'CAJA_ABIERTA'; datos: SesionConResumen };

export function abrirCaja(
  db: Db,
  datos: { registerId: string; usuarioId: string; efectivoInicialClp: number },
): ResultadoApertura {
  return db.transaction(() => {
    const abierta = sesionAbierta(db, datos.registerId);
    if (abierta) return { ok: false, error: 'CAJA_ABIERTA', datos: abierta };
    const f = db
      .insert(cashSessions)
      .values({
        registerId: datos.registerId,
        openedBy: datos.usuarioId,
        openingCash: datos.efectivoInicialClp,
      })
      .returning()
      .get();
    return { ok: true, datos: completa(db, f) };
  });
}

export type ResultadoCierre =
  { ok: true; datos: SesionConResumen } | { ok: false; error: 'CAJA_CERRADA' };

/** Cierra la sesión abierta: congela el efectivo esperado y guarda lo contado. */
export function cerrarCaja(
  db: Db,
  datos: { registerId: string; usuarioId: string; efectivoContadoClp: number },
): ResultadoCierre {
  return db.transaction(() => {
    const f = filaAbierta(db, datos.registerId);
    if (!f) return { ok: false, error: 'CAJA_CERRADA' };
    const resumen = resumir(db, f);
    // Valida el monto contado (entero, no negativo).
    diferenciaCaja(resumen.efectivoEsperadoClp, datos.efectivoContadoClp);
    const cerradaEn = new Date();
    const cerrada = db
      .update(cashSessions)
      .set({
        closedBy: datos.usuarioId,
        closedAt: cerradaEn,
        countedCash: datos.efectivoContadoClp,
        expectedCash: resumen.efectivoEsperadoClp,
      })
      .where(eq(cashSessions.id, f.id))
      .returning()
      .get();
    const registro = db
      .select({ name: registers.name })
      .from(registers)
      .where(eq(registers.id, datos.registerId))
      .get();
    // Aviso de cierre para el dueño en el móvil (sin push): sube con el outbox.
    encolar(db, {
      entity: 'cash_closes',
      entityId: cerrada.id,
      op: 'INSERT',
      payload: {
        id: cerrada.id,
        registerId: datos.registerId,
        registerName: registro?.name ?? null,
        closedAt: cerradaEn.toISOString(),
        countedCashClp: datos.efectivoContadoClp,
        expectedCashClp: resumen.efectivoEsperadoClp,
        differenceClp: datos.efectivoContadoClp - resumen.efectivoEsperadoClp,
        totalVentasClp: resumen.totalVentasClp,
        cantidadVentas: resumen.cantidadVentas,
      } satisfies CierreCajaWire,
    });
    return {
      ok: true,
      datos: { sesion: aSesion(db, cerrada), resumen, movimientos: movimientosDe(db, f.id) },
    };
  });
}

export type ResultadoMovimiento =
  | { ok: true; movimiento: MovimientoCaja; datos: SesionConResumen }
  | { ok: false; error: 'CAJA_CERRADA' };

/**
 * Registra un retiro o ingreso de efectivo en el turno abierto. Ajusta el efectivo esperado del
 * cierre y queda a nombre de quien lo hizo.
 */
export function registrarMovimiento(
  db: Db,
  datos: {
    registerId: string;
    usuarioId: string;
    tipo: TipoMovimientoEfectivo;
    montoClp: number;
    motivo: string;
  },
): ResultadoMovimiento {
  const motivo = datos.motivo.trim();
  if (motivo.length < 2) {
    throw new ErrorDominio('MOTIVO_REQUERIDO', 'Escribe el motivo del movimiento');
  }
  validarMovimientoEfectivo({ tipo: datos.tipo, montoClp: datos.montoClp });
  return db.transaction(() => {
    const f = filaAbierta(db, datos.registerId);
    if (!f) return { ok: false, error: 'CAJA_CERRADA' };
    const fila = db
      .insert(cashMovements)
      .values({
        cashSessionId: f.id,
        type: datos.tipo,
        amountClp: datos.montoClp,
        reason: motivo,
        userId: datos.usuarioId,
      })
      .returning()
      .get();
    const resultado = completa(db, f);
    const movimiento = resultado.movimientos.find((m) => m.id === fila.id);
    /* v8 ignore next -- recién insertado en la misma transacción */
    if (!movimiento) throw new Error('movimiento no encontrado');
    return { ok: true, movimiento, datos: resultado };
  });
}
