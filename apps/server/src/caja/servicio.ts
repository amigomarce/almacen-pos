import { cuadrarCaja, diferenciaCaja, type CuadraturaCaja, type MedioPago } from '@almacen/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cashSessions, registers, sales, users } from '../db/schema.js';

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
}

export interface SesionConResumen {
  sesion: SesionCaja;
  resumen: CuadraturaCaja;
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
  };
}

function filaAbierta(db: Db, registerId: string): FilaSesion | undefined {
  return db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.registerId, registerId), isNull(cashSessions.closedAt)))
    .get();
}

function resumir(db: Db, f: FilaSesion): CuadraturaCaja {
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
  );
}

export function sesionAbierta(db: Db, registerId: string): SesionConResumen | null {
  const f = filaAbierta(db, registerId);
  return f ? { sesion: aSesion(db, f), resumen: resumir(db, f) } : null;
}

export function sesionPorId(db: Db, id: string): SesionConResumen | null {
  const f = db.select().from(cashSessions).where(eq(cashSessions.id, id)).get();
  return f ? { sesion: aSesion(db, f), resumen: resumir(db, f) } : null;
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
    return { ok: true, datos: { sesion: aSesion(db, f), resumen: resumir(db, f) } };
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
    const cerrada = db
      .update(cashSessions)
      .set({
        closedBy: datos.usuarioId,
        closedAt: new Date(),
        countedCash: datos.efectivoContadoClp,
        expectedCash: resumen.efectivoEsperadoClp,
      })
      .where(eq(cashSessions.id, f.id))
      .returning()
      .get();
    return { ok: true, datos: { sesion: aSesion(db, cerrada), resumen } };
  });
}
