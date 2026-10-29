/**
 * Fiado / cuenta corriente de vecinos (ADR-022). Los clientes no se borran (se desactivan) y la
 * cuenta solo crece: cada venta fiada, abono, anulación, devolución o ajuste es una fila.
 */
import {
  ErrorDominio,
  evaluarFiado,
  formatearClp,
  validarAbono,
  type MedioAbono,
} from '@almacen/core';
import type { ClienteWire, MovimientoFiadoWire } from '@almacen/sync';
import { and, asc, desc, eq, isNull, like, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cashSessions, customerLedger, customers, users } from '../db/schema.js';
import { ErrorHttp } from '../errores.js';
import { encolar } from '../sincronizacion/outbox.js';

type FilaCliente = typeof customers.$inferSelect;
type FilaMovimiento = typeof customerLedger.$inferSelect;
export type TipoMovimientoFiado = FilaMovimiento['type'];

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  nota: string | null;
  limiteClp: number | null;
  activo: boolean;
  /** Lo que debe (negativo = a su favor). */
  saldoClp: number;
  ultimoMovimiento: string | null;
}

export interface MovimientoFiado {
  id: string;
  tipo: TipoMovimientoFiado;
  montoClp: number;
  ventaId: string | null;
  medioPago: string | null;
  motivo: string | null;
  usuario: string;
  creadoEn: string;
}

const clienteAWire = (c: FilaCliente): ClienteWire => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  note: c.note,
  creditLimitClp: c.creditLimitClp,
  active: c.active,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  version: c.version,
  deletedAt: c.deletedAt?.toISOString() ?? null,
});

const movimientoAWire = (m: FilaMovimiento): MovimientoFiadoWire => ({
  id: m.id,
  customerId: m.customerId,
  type: m.type,
  amountClp: m.amountClp,
  saleId: m.saleId,
  returnId: m.returnId,
  paymentMethod: m.paymentMethod,
  reason: m.reason,
  createdAt: m.createdAt.toISOString(),
});

export function saldoDe(db: Db, clienteId: string): number {
  return (
    db
      .select({ s: sql<number>`coalesce(sum(${customerLedger.amountClp}), 0)` })
      .from(customerLedger)
      .where(eq(customerLedger.customerId, clienteId))
      .get()?.s ?? 0
  );
}

function aCliente(db: Db, c: FilaCliente): Cliente {
  const ultimo = db
    .select({ en: customerLedger.createdAt })
    .from(customerLedger)
    .where(eq(customerLedger.customerId, c.id))
    .orderBy(desc(customerLedger.createdAt))
    .get();
  return {
    id: c.id,
    nombre: c.name,
    telefono: c.phone,
    nota: c.note,
    limiteClp: c.creditLimitClp,
    activo: c.active,
    saldoClp: saldoDe(db, c.id),
    ultimoMovimiento: ultimo?.en.toISOString() ?? null,
  };
}

function filaCliente(db: Db, id: string): FilaCliente {
  const c = db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .get();
  if (!c) throw new ErrorHttp('NO_ENCONTRADO', 'Cliente no encontrado', 404);
  return c;
}

export function obtenerCliente(db: Db, id: string): Cliente {
  return aCliente(db, filaCliente(db, id));
}

/** Clientes por nombre; los que más deben primero si `porDeuda`. */
export function listarClientes(
  db: Db,
  opciones: { buscar?: string; incluirInactivos?: boolean; porDeuda?: boolean } = {},
): Cliente[] {
  const filtros = [isNull(customers.deletedAt)];
  if (!opciones.incluirInactivos) filtros.push(eq(customers.active, true));
  const texto = opciones.buscar?.trim();
  if (texto) filtros.push(like(customers.name, `%${texto}%`));
  const lista = db
    .select()
    .from(customers)
    .where(and(...filtros))
    .orderBy(asc(customers.name))
    .all()
    .map((c) => aCliente(db, c));
  return opciones.porDeuda ? lista.sort((a, b) => b.saldoClp - a.saldoClp) : lista;
}

export interface DatosCliente {
  nombre?: string;
  telefono?: string | null;
  nota?: string | null;
  limiteClp?: number | null;
  activo?: boolean;
}

const texto = (v: string | null | undefined) => {
  if (v === undefined || v === null) return v;
  const t = v.trim();
  return t === '' ? null : t;
};

function validarLimite(limite: number | null | undefined): void {
  if (limite === undefined || limite === null) return;
  if (!Number.isSafeInteger(limite) || limite < 0) {
    throw new ErrorDominio('LIMITE_INVALIDO', 'El límite debe ser un monto entero, $0 o más');
  }
}

export function crearCliente(db: Db, datos: DatosCliente): Cliente {
  const nombre = texto(datos.nombre);
  if (!nombre) throw new ErrorDominio('NOMBRE_REQUERIDO', 'Escribe el nombre del vecino');
  validarLimite(datos.limiteClp);
  return db.transaction(() => {
    const c = db
      .insert(customers)
      .values({
        name: nombre,
        phone: texto(datos.telefono) ?? null,
        note: texto(datos.nota) ?? null,
        creditLimitClp: datos.limiteClp ?? null,
        active: datos.activo ?? true,
      })
      .returning()
      .get();
    encolar(db, { entity: 'customers', entityId: c.id, op: 'INSERT', payload: clienteAWire(c) });
    return aCliente(db, c);
  });
}

export function editarCliente(db: Db, id: string, datos: DatosCliente): Cliente {
  const actual = filaCliente(db, id);
  const nombre = datos.nombre === undefined ? actual.name : texto(datos.nombre);
  if (!nombre) throw new ErrorDominio('NOMBRE_REQUERIDO', 'Escribe el nombre del vecino');
  validarLimite(datos.limiteClp);
  return db.transaction(() => {
    const c = db
      .update(customers)
      .set({
        name: nombre,
        ...(datos.telefono !== undefined ? { phone: texto(datos.telefono) ?? null } : {}),
        ...(datos.nota !== undefined ? { note: texto(datos.nota) ?? null } : {}),
        ...(datos.limiteClp !== undefined ? { creditLimitClp: datos.limiteClp } : {}),
        ...(datos.activo !== undefined ? { active: datos.activo } : {}),
        updatedAt: new Date(),
        version: sql`${customers.version} + 1`,
      })
      .where(eq(customers.id, id))
      .returning()
      .get();
    encolar(db, { entity: 'customers', entityId: c.id, op: 'UPDATE', payload: clienteAWire(c) });
    return aCliente(db, c);
  });
}

function insertarMovimiento(db: Db, datos: typeof customerLedger.$inferInsert): FilaMovimiento {
  const m = db.insert(customerLedger).values(datos).returning().get();
  encolar(db, {
    entity: 'customer_ledger',
    entityId: m.id,
    op: 'INSERT',
    payload: movimientoAWire(m),
  });
  return m;
}

export function movimientosDe(db: Db, clienteId: string, limite = 100): MovimientoFiado[] {
  filaCliente(db, clienteId);
  return db
    .select({ m: customerLedger, usuario: users.name })
    .from(customerLedger)
    .innerJoin(users, eq(users.id, customerLedger.userId))
    .where(eq(customerLedger.customerId, clienteId))
    .orderBy(desc(customerLedger.createdAt))
    .limit(limite)
    .all()
    .map(({ m, usuario }) => ({
      id: m.id,
      tipo: m.type,
      montoClp: m.amountClp,
      ventaId: m.saleId,
      medioPago: m.paymentMethod,
      motivo: m.reason,
      usuario,
      creadoEn: m.createdAt.toISOString(),
    }));
}

/**
 * Carga una venta fiada a la cuenta del vecino (dentro de la transacción de la venta). Si
 * supera el límite y nadie la autorizó, se rechaza con `FIADO_EXCEDE_LIMITE` para que la caja
 * pida la clave del dueño.
 */
export function cargarVentaFiada(
  db: Db,
  datos: {
    clienteId: string | undefined;
    ventaId: string;
    montoClp: number;
    usuarioId: string;
    autorizadaPorId: string | null;
    ahora: Date;
  },
): void {
  if (!datos.clienteId) {
    throw new ErrorHttp('FALTA_CLIENTE', 'Elige a qué vecino se le fía', 400);
  }
  const c = filaCliente(db, datos.clienteId);
  if (!c.active) {
    throw new ErrorHttp('CLIENTE_INACTIVO', `${c.name} no tiene la cuenta habilitada`, 409);
  }
  if (datos.montoClp === 0) return;
  const saldo = saldoDe(db, c.id);
  const evaluacion = evaluarFiado(saldo, datos.montoClp, c.creditLimitClp);
  if (evaluacion.excedeLimite && !datos.autorizadaPorId) {
    throw new ErrorHttp(
      'FIADO_EXCEDE_LIMITE',
      `${c.name} quedaría debiendo ${formatearClp(evaluacion.saldoNuevoClp)} (límite ${formatearClp(c.creditLimitClp ?? 0)}): se necesita la clave del dueño`,
      403,
      { saldoClp: saldo, limiteClp: c.creditLimitClp, saldoNuevoClp: evaluacion.saldoNuevoClp },
    );
  }
  insertarMovimiento(db, {
    customerId: c.id,
    type: 'VENTA',
    amountClp: datos.montoClp,
    saleId: datos.ventaId,
    userId: datos.usuarioId,
    authorizedBy: evaluacion.excedeLimite ? datos.autorizadaPorId : null,
    reason: evaluacion.excedeLimite ? 'Sobre el límite, autorizado por el dueño' : null,
    createdAt: datos.ahora,
  });
}

/** Descuenta de la cuenta una venta fiada anulada o devuelta (dentro de su transacción). */
export function descontarVentaFiada(
  db: Db,
  datos: {
    clienteId: string;
    ventaId: string;
    devolucionId?: string;
    montoClp: number;
    tipo: 'ANULACION' | 'DEVOLUCION';
    usuarioId: string;
    autorizadaPorId: string;
    motivo: string;
    ahora: Date;
  },
): void {
  if (datos.montoClp <= 0) return;
  insertarMovimiento(db, {
    customerId: datos.clienteId,
    type: datos.tipo,
    amountClp: -datos.montoClp,
    saleId: datos.ventaId,
    returnId: datos.devolucionId ?? null,
    userId: datos.usuarioId,
    authorizedBy: datos.autorizadaPorId,
    reason: datos.motivo,
    createdAt: datos.ahora,
  });
}

export interface ResultadoAbono {
  movimiento: MovimientoFiado;
  cliente: Cliente;
}

/** Abono del vecino. Necesita la caja abierta: si es en efectivo, entra al cajón del turno. */
export function registrarAbono(
  db: Db,
  datos: {
    clienteId: string;
    montoClp: number;
    medioPago: MedioAbono;
    registerId: string;
    usuarioId: string;
  },
): ResultadoAbono {
  const id = db.transaction(() => {
    const c = filaCliente(db, datos.clienteId);
    const sesion = db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.registerId, datos.registerId), isNull(cashSessions.closedAt)))
      .get();
    if (!sesion) throw new ErrorHttp('CAJA_CERRADA', 'Abre la caja para recibir un abono', 409);
    validarAbono(saldoDe(db, c.id), datos.montoClp);
    return insertarMovimiento(db, {
      customerId: c.id,
      type: 'ABONO',
      amountClp: -datos.montoClp,
      paymentMethod: datos.medioPago,
      cashSessionId: sesion.id,
      userId: datos.usuarioId,
    }).id;
  });
  const movimiento = movimientosDe(db, datos.clienteId).find((m) => m.id === id);
  /* v8 ignore next -- recién registrado */
  if (!movimiento) throw new Error('Abono no encontrado');
  return { movimiento, cliente: obtenerCliente(db, datos.clienteId) };
}

/**
 * Ajuste del dueño (perdonar una deuda, corregir un error). Positivo aumenta la deuda y
 * negativo la baja. Siempre con motivo; no toca la caja.
 */
export function registrarAjuste(
  db: Db,
  datos: { clienteId: string; montoClp: number; motivo: string; usuarioId: string },
): ResultadoAbono {
  const motivo = datos.motivo.trim();
  if (motivo.length < 3) throw new ErrorDominio('MOTIVO_REQUERIDO', 'Escribe el motivo del ajuste');
  if (!Number.isSafeInteger(datos.montoClp) || datos.montoClp === 0) {
    throw new ErrorDominio('MONTO_INVALIDO', 'El ajuste debe ser un monto entero distinto de cero');
  }
  filaCliente(db, datos.clienteId);
  const m = db.transaction(() =>
    insertarMovimiento(db, {
      customerId: datos.clienteId,
      type: 'AJUSTE',
      amountClp: datos.montoClp,
      reason: motivo,
      userId: datos.usuarioId,
      authorizedBy: datos.usuarioId,
    }),
  );
  const movimiento = movimientosDe(db, datos.clienteId).find((x) => x.id === m.id);
  /* v8 ignore next -- recién registrado */
  if (!movimiento) throw new Error('Ajuste no encontrado');
  return { movimiento, cliente: obtenerCliente(db, datos.clienteId) };
}

/** Abonos recibidos en un turno (para cuadrar la caja). */
export function abonosDeSesion(
  db: Db,
  sesionId: string,
): { medioPago: MedioAbono; montoClp: number }[] {
  return db
    .select({ medioPago: customerLedger.paymentMethod, montoClp: customerLedger.amountClp })
    .from(customerLedger)
    .where(and(eq(customerLedger.cashSessionId, sesionId), eq(customerLedger.type, 'ABONO')))
    .all()
    .map((a) => ({ medioPago: a.medioPago as MedioAbono, montoClp: -a.montoClp }));
}

/** Datos para imprimir (o reimprimir) el recibo de un abono, con el saldo que quedó. */
export function datosReciboAbono(
  db: Db,
  clienteId: string,
  abonoId: string,
): {
  cliente: string;
  fecha: Date;
  cajero: string;
  montoClp: number;
  medioPago: MedioAbono;
  saldoClp: number;
} {
  const c = filaCliente(db, clienteId);
  const m = db
    .select({ m: customerLedger, cajero: users.name })
    .from(customerLedger)
    .innerJoin(users, eq(users.id, customerLedger.userId))
    .where(
      and(
        eq(customerLedger.id, abonoId),
        eq(customerLedger.customerId, clienteId),
        eq(customerLedger.type, 'ABONO'),
      ),
    )
    .get();
  if (!m) throw new ErrorHttp('NO_ENCONTRADO', 'Abono no encontrado', 404);
  const saldo =
    db
      .select({ s: sql<number>`coalesce(sum(${customerLedger.amountClp}), 0)` })
      .from(customerLedger)
      .where(
        and(
          eq(customerLedger.customerId, clienteId),
          sql`${customerLedger.createdAt} <= ${m.m.createdAt.getTime()}`,
        ),
      )
      .get()?.s ?? 0;
  return {
    cliente: c.name,
    fecha: m.m.createdAt,
    cajero: m.cajero,
    montoClp: -m.m.amountClp,
    medioPago: m.m.paymentMethod as MedioAbono,
    saldoClp: saldo,
  };
}
