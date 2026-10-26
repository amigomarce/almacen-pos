import {
  calcularCobro,
  calcularTotalesDocumento,
  calcularVenta,
  calcularVuelto,
  estimarCantidadPorMonto,
  formatearClp,
  type LineaVentaEntrada,
  type MedioPago,
  type Promocion,
  type TipoImpuesto,
  type TotalesDocumento,
  type Unidad,
} from '@almacen/core';
import {
  crearProvider,
  leyendasBoleta,
  normalizarFolioExterno,
  type DocumentoEmitido,
  type Entrega,
  type EstadoSii,
  type NombreProvider,
  type TipoDte,
  type VentaParaDte,
} from '@almacen/dte';
import { and, desc, eq, inArray, isNull, lte, or, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  cashSessions,
  products,
  promotions,
  registers,
  saleItems,
  sales,
  stockMovements,
  taxDocuments,
  users,
} from '../db/schema.js';
import { leerConfiguracion } from '../configuracion/servicio.js';
import { ErrorHttp } from '../errores.js';
import { lineaAWire, movimientoAWire, ventaAWire } from '../sincronizacion/mapping.js';
import { encolar } from '../sincronizacion/outbox.js';
import { crearProviderDeVenta, type DependenciasSii } from '../sii/proveedor.js';

// ---------- Tipos de entrada y salida ----------

export interface LineaPedido {
  /** `null` = venta rápida sin producto (pan, verduras): exige nombre, unidad y precio. */
  productoId: string | null;
  nombre?: string;
  unidad?: Unidad;
  cantidadMilli: number;
  precioUnitarioClp?: number;
  tipoImpuesto?: TipoImpuesto;
  descuentoManualClp?: number;
  /**
   * Solo productos por peso: cobrar este monto exacto ("$1.000 de pan" o etiqueta de balanza
   * con precio). El servidor recalcula el peso estimado; `cantidadMilli` se ignora (ADR-006).
   */
  montoFijoClp?: number;
}

export interface PedidoVenta {
  /** Id generado por la caja (UUID). Reenviar el mismo id no duplica la venta. */
  id: string;
  lineas: readonly LineaPedido[];
  medioPago: MedioPago;
  /** Solo efectivo: con cuánto paga el cliente. Si falta, se asume el monto exacto. */
  pagadoClp?: number;
  entrega?: Entrega;
  /** Total que mostró la pantalla. Si los precios cambiaron, la venta se rechaza. */
  totalEsperadoClp?: number;
}

export interface LineaDetalle {
  productoId: string | null;
  nombre: string;
  unidad: Unidad;
  cantidadMilli: number;
  precioUnitarioClp: number;
  tipoImpuesto: TipoImpuesto;
  descuentoClp: number;
  totalLineaClp: number;
}

export interface DocumentoDetalle {
  provider: NombreProvider;
  tipoDte: TipoDte | null;
  folio: number | null;
  entrega: Entrega;
  folioExterno: string | null;
  validoComoBoleta: boolean;
  estadoSii: EstadoSii;
  trackId: string | null;
  leyendas: readonly string[];
  /** Lo que debe hacer el cajero (ej. emitir en e-Boleta). `null` si nada. */
  accionCajero: string | null;
}

export interface VentaDetalle {
  id: string;
  numero: number;
  estado: 'OK' | 'ANULADA';
  creadaEn: string;
  cajero: { id: string; name: string };
  registerId: string;
  sesionCajaId: string | null;
  medioPago: MedioPago;
  totalClp: number;
  redondeoClp: number;
  /** Lo que pagó el cliente realmente: total + redondeo. */
  totalCobradoClp: number;
  pagadoClp: number;
  vueltoClp: number;
  descuentoTotalClp: number;
  totales: TotalesDocumento;
  lineas: LineaDetalle[];
  anulacion: { en: string; autorizadaPor: { id: string; name: string }; motivo: string } | null;
  documento: DocumentoDetalle | null;
  /** Por qué no hay documento: con tarjeta el voucher es la boleta, o el total es $0. */
  motivoSinDocumento: 'VOUCHER_ES_BOLETA' | 'TOTAL_CERO' | null;
}

// ---------- Lectura ----------

function nombreUsuario(db: Db, id: string): { id: string; name: string } {
  const u = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).get();
  return u ?? { id, name: '?' };
}

function nombreRegistro(db: Db, id: string): string | null {
  return (
    db.select({ name: registers.name }).from(registers).where(eq(registers.id, id)).get()?.name ??
    null
  );
}

function ventaParaDte(
  v: typeof sales.$inferSelect,
  lineas: readonly LineaDetalle[],
  totales: TotalesDocumento,
  entrega: Entrega,
): VentaParaDte {
  return {
    ventaId: v.id,
    numeroVenta: v.number,
    fecha: v.createdAt,
    medioPago: v.paymentMethod as MedioPago,
    entrega,
    lineas: lineas.map((l) => ({
      nombre: l.nombre,
      unidad: l.unidad,
      cantidadMilli: l.cantidadMilli,
      precioUnitarioClp: l.precioUnitarioClp,
      montoClp: l.totalLineaClp,
      tipoImpuesto: l.tipoImpuesto,
    })),
    totales,
  };
}

/** Rearma el documento guardado para mostrarlo o reimprimirlo. */
async function vistaDocumento(
  doc: typeof taxDocuments.$inferSelect,
  dte: VentaParaDte,
): Promise<DocumentoDetalle> {
  const base = {
    provider: doc.provider,
    tipoDte: doc.dteType as TipoDte | null,
    folio: doc.folio,
    entrega: doc.entrega,
    folioExterno: doc.folioExterno,
    estadoSii: doc.siiStatus,
    trackId: doc.trackId,
  };
  if (doc.provider === 'SII_DIRECTO') {
    // Se lee de la base: reemitir consumiría otro folio.
    return {
      ...base,
      validoComoBoleta: true,
      leyendas:
        doc.dteType !== null && doc.folio !== null
          ? leyendasBoleta(doc.dteType as TipoDte, doc.folio, doc.totalClp)
          : [],
      accionCajero: null,
    };
  }
  const provider = crearProvider(doc.provider, 'TODO_MEDIO_PAGO');
  const r = await provider.emitirBoleta(dte);
  /* v8 ignore next -- con TODO_MEDIO_PAGO y total > 0 siempre emite */
  const emitido = r.emitido ? r.documento : null;
  return {
    ...base,
    validoComoBoleta: emitido?.validoComoBoleta ?? false,
    leyendas: emitido?.leyendas ?? [],
    accionCajero: doc.folioExterno ? null : (emitido?.accionCajero ?? null),
  };
}

export async function obtenerVenta(db: Db, id: string): Promise<VentaDetalle | null> {
  const v = db.select().from(sales).where(eq(sales.id, id)).get();
  if (!v) return null;
  const items = db.select().from(saleItems).where(eq(saleItems.saleId, id)).all();
  const lineas: LineaDetalle[] = items.map((i) => ({
    productoId: i.productId,
    nombre: i.nameSnapshot,
    unidad: i.unit,
    cantidadMilli: i.qtyMilli,
    precioUnitarioClp: i.unitPriceClp,
    tipoImpuesto: i.taxType,
    descuentoClp: i.discountClp,
    totalLineaClp: i.lineTotalClp,
  }));
  const totales = calcularTotalesDocumento(
    lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.totalLineaClp })),
  );
  const doc = db.select().from(taxDocuments).where(eq(taxDocuments.saleId, id)).get();
  const documento = doc
    ? await vistaDocumento(doc, ventaParaDte(v, lineas, totales, doc.entrega))
    : null;
  return {
    id: v.id,
    numero: v.number,
    estado: v.status,
    creadaEn: v.createdAt.toISOString(),
    cajero: nombreUsuario(db, v.cashierId),
    registerId: v.registerId,
    sesionCajaId: v.cashSessionId,
    medioPago: v.paymentMethod as MedioPago,
    totalClp: v.totalClp,
    redondeoClp: v.roundingClp,
    totalCobradoClp: v.totalClp + v.roundingClp,
    pagadoClp: v.paidClp,
    vueltoClp: v.changeClp,
    descuentoTotalClp: lineas.reduce((s, l) => s + l.descuentoClp, 0),
    totales,
    lineas,
    anulacion:
      v.voidedAt && v.voidedBy
        ? {
            en: v.voidedAt.toISOString(),
            autorizadaPor: nombreUsuario(db, v.voidedBy),
            motivo: v.voidReason ?? '',
          }
        : null,
    documento,
    motivoSinDocumento: doc ? null : v.totalClp === 0 ? 'TOTAL_CERO' : 'VOUCHER_ES_BOLETA',
  };
}

function sesionAbiertaId(db: Db, registerId: string): string | null {
  return (
    db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.registerId, registerId), isNull(cashSessions.closedAt)))
      .get()?.id ?? null
  );
}

/** Última venta de la sesión de caja abierta (para "anular la última"). */
export function ultimaVentaId(db: Db, registerId: string): string | null {
  const sesion = sesionAbiertaId(db, registerId);
  if (!sesion) return null;
  return (
    db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.cashSessionId, sesion))
      .orderBy(desc(sales.number))
      .get()?.id ?? null
  );
}

// ---------- Registrar venta ----------

function promocionesVigentes(db: Db, productoIds: string[], ahora: Date): Promocion[] {
  if (productoIds.length === 0) return [];
  return db
    .select()
    .from(promotions)
    .where(
      and(
        inArray(promotions.productId, productoIds),
        eq(promotions.active, true),
        isNull(promotions.deletedAt),
        or(isNull(promotions.startsAt), lte(promotions.startsAt, ahora)),
        or(isNull(promotions.endsAt), gte(promotions.endsAt, ahora)),
      ),
    )
    .all()
    .map((p) => ({
      productoId: p.productId,
      cantidadPack: p.packQty,
      precioPackClp: p.packPriceClp,
    }));
}

/** Convierte lo que pide la caja en líneas para `calcularVenta`, con datos de la base. */
function armarLineas(db: Db, pedido: readonly LineaPedido[]): LineaVentaEntrada[] {
  const ids = [...new Set(pedido.flatMap((l) => (l.productoId ? [l.productoId] : [])))];
  const filas = ids.length
    ? db
        .select()
        .from(products)
        .where(and(inArray(products.id, ids), isNull(products.deletedAt)))
        .all()
    : [];
  const porId = new Map(filas.map((p) => [p.id, p]));

  return pedido.map((l, i): LineaVentaEntrada => {
    const descuento = l.descuentoManualClp ?? 0;
    /** Con monto fijo, el peso se estima con el precio por kg (nunca se confía en la caja). */
    const porMonto = (unidad: Unidad, precio: number) => {
      if (l.montoFijoClp === undefined) return { cantidadMilli: l.cantidadMilli };
      if (unidad !== 'KG') {
        throw new ErrorHttp(
          'MONTO_SOLO_KG',
          `Línea ${i + 1}: solo los productos por peso se venden por monto`,
          400,
        );
      }
      return {
        cantidadMilli: estimarCantidadPorMonto(l.montoFijoClp, precio),
        subtotalFijoClp: l.montoFijoClp,
      };
    };
    if (l.productoId) {
      const p = porId.get(l.productoId);
      if (!p?.active) {
        throw new ErrorHttp(
          'PRODUCTO_NO_ENCONTRADO',
          `Línea ${i + 1}: el producto ya no existe o está desactivado`,
          400,
        );
      }
      // Precio, nombre, unidad e impuesto salen de la base, no de la pantalla.
      return {
        productoId: p.id,
        nombre: p.name,
        unidad: p.unit,
        ...porMonto(p.unit, p.priceClp),
        precioUnitarioClp: p.priceClp,
        tipoImpuesto: p.taxType,
        descuentoManualClp: descuento,
      };
    }
    if (l.nombre === undefined || l.unidad === undefined || l.precioUnitarioClp === undefined) {
      throw new ErrorHttp(
        'LINEA_INCOMPLETA',
        `Línea ${i + 1}: una venta rápida necesita nombre, unidad y precio`,
        400,
      );
    }
    return {
      productoId: null,
      nombre: l.nombre.trim(),
      unidad: l.unidad,
      ...porMonto(l.unidad, l.precioUnitarioClp),
      precioUnitarioClp: l.precioUnitarioClp,
      tipoImpuesto: l.tipoImpuesto ?? 'AFECTO',
      descuentoManualClp: descuento,
    };
  });
}

export interface Cotizacion {
  totalClp: number;
  descuentoTotalClp: number;
  lineas: LineaDetalle[];
}

/** Calcula el carrito como lo cobrará el servidor (precios y promociones vigentes), sin guardar. */
export function cotizarVenta(
  db: Db,
  lineas: readonly LineaPedido[],
  ahora = new Date(),
): Cotizacion {
  const entradas = armarLineas(db, lineas);
  const ids = [...new Set(entradas.flatMap((l) => (l.productoId ? [l.productoId] : [])))];
  const calculo = calcularVenta(entradas, promocionesVigentes(db, ids, ahora));
  return {
    totalClp: calculo.totalClp,
    descuentoTotalClp: calculo.descuentoTotalClp,
    lineas: calculo.lineas.map((l) => ({
      productoId: l.productoId,
      nombre: l.nombre,
      unidad: l.unidad,
      cantidadMilli: l.cantidadMilli,
      precioUnitarioClp: l.precioUnitarioClp,
      tipoImpuesto: l.tipoImpuesto,
      descuentoClp: l.descuentoManualClp + l.descuentoPromoClp,
      totalLineaClp: l.totalLineaClp,
    })),
  };
}

export interface ResultadoRegistro {
  venta: VentaDetalle;
  /** `true` si el id ya existía (reintento): no se creó otra venta. */
  repetida: boolean;
}

export async function registrarVenta(
  db: Db,
  datos: { pedido: PedidoVenta; registerId: string; cajeroId: string; ahora?: Date },
  log?: { error: (obj: object, msg: string) => void },
  dependenciasSii?: DependenciasSii,
): Promise<ResultadoRegistro> {
  const { pedido, registerId, cajeroId } = datos;
  const ahora = datos.ahora ?? new Date();

  const existente = await obtenerVenta(db, pedido.id);
  if (existente) return { venta: existente, repetida: true };

  const config = leerConfiguracion(db);
  const entrega = pedido.entrega ?? 'IMPRESA';

  const guardada = db.transaction(() => {
    const sesionId = sesionAbiertaId(db, registerId);
    if (!sesionId) {
      throw new ErrorHttp('CAJA_CERRADA', 'Abre la caja antes de vender', 409);
    }
    const entradas = armarLineas(db, pedido.lineas);
    const productoIds = [...new Set(entradas.flatMap((l) => (l.productoId ? [l.productoId] : [])))];
    const calculo = calcularVenta(entradas, promocionesVigentes(db, productoIds, ahora));

    if (pedido.totalEsperadoClp !== undefined && pedido.totalEsperadoClp !== calculo.totalClp) {
      throw new ErrorHttp(
        'TOTAL_CAMBIO',
        `Los precios cambiaron: el total ahora es ${formatearClp(calculo.totalClp)}`,
        409,
        { totalClp: calculo.totalClp, lineas: calculo.lineas },
      );
    }

    const cobro = calcularCobro(calculo.totalClp, pedido.medioPago, config.cashRoundingEnabled);
    const pagado =
      pedido.medioPago === 'EFECTIVO'
        ? (pedido.pagadoClp ?? cobro.totalACobrarClp)
        : cobro.totalACobrarClp;
    const vuelto = calcularVuelto(cobro.totalACobrarClp, pagado);

    const ultimo = db
      .select({ n: sql<number>`coalesce(max(${sales.number}), 0)` })
      .from(sales)
      .where(eq(sales.registerId, registerId))
      .get();
    const venta = db
      .insert(sales)
      .values({
        id: pedido.id,
        number: (ultimo?.n ?? 0) + 1,
        registerId,
        cashSessionId: sesionId,
        cashierId: cajeroId,
        totalClp: calculo.totalClp,
        roundingClp: cobro.redondeoClp,
        paymentMethod: pedido.medioPago,
        paidClp: pagado,
        changeClp: vuelto,
        createdAt: ahora,
      })
      .returning()
      .get();

    for (const l of calculo.lineas) {
      const item = db
        .insert(saleItems)
        .values({
          saleId: venta.id,
          productId: l.productoId,
          nameSnapshot: l.nombre,
          unit: l.unidad,
          qtyMilli: l.cantidadMilli,
          unitPriceClp: l.precioUnitarioClp,
          taxType: l.tipoImpuesto,
          discountClp: l.descuentoManualClp + l.descuentoPromoClp,
          lineTotalClp: l.totalLineaClp,
        })
        .returning()
        .get();
      encolar(db, {
        entity: 'sale_items',
        entityId: item.id,
        op: 'INSERT',
        payload: lineaAWire(item),
      });
      if (l.productoId) {
        // Stock negativo permitido: en el almacén se vende aunque el sistema diga 0.
        const m = db
          .insert(stockMovements)
          .values({
            productId: l.productoId,
            qtyMilli: -l.cantidadMilli,
            type: 'VENTA',
            refId: venta.id,
            userId: cajeroId,
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
          .set({ stockQtyMilli: sql`${products.stockQtyMilli} - ${l.cantidadMilli}` })
          .where(eq(products.id, l.productoId))
          .run();
      }
    }
    encolar(db, {
      entity: 'sales',
      entityId: venta.id,
      op: 'INSERT',
      payload: ventaAWire(venta, {
        registerName: nombreRegistro(db, registerId),
        cashierName: nombreUsuario(db, cajeroId).name,
      }),
    });
    return { venta, calculo };
  });

  // La venta ya quedó guardada: el documento va después (offline-first, ARQUITECTURA §5).
  const { venta, calculo } = guardada;
  const lineasDetalle: LineaDetalle[] = calculo.lineas.map((l) => ({
    productoId: l.productoId,
    nombre: l.nombre,
    unidad: l.unidad,
    cantidadMilli: l.cantidadMilli,
    precioUnitarioClp: l.precioUnitarioClp,
    tipoImpuesto: l.tipoImpuesto,
    descuentoClp: l.descuentoManualClp + l.descuentoPromoClp,
    totalLineaClp: l.totalLineaClp,
  }));
  try {
    const provider = crearProviderDeVenta(db, config, dependenciasSii);
    const r = await provider.emitirBoleta(
      ventaParaDte(venta, lineasDetalle, calculo.totales, entrega),
    );
    // `SII_DIRECTO` ya guardó el DTE en su cola al emitir; los demás providers son efímeros.
    if (r.emitido && config.dteProvider !== 'SII_DIRECTO') {
      guardarDocumento(db, venta.id, r.documento);
    }
  } catch (error) {
    log?.error({ err: error, ventaId: venta.id }, 'No se pudo emitir el documento de la venta');
  }

  const detalle = await obtenerVenta(db, venta.id);
  /* v8 ignore next -- se acaba de guardar */
  if (!detalle) throw new Error('Venta recién guardada no encontrada');
  return { venta: detalle, repetida: false };
}

function guardarDocumento(db: Db, ventaId: string, d: DocumentoEmitido): void {
  db.insert(taxDocuments)
    .values({
      saleId: ventaId,
      provider: d.provider,
      dteType: d.tipoDte,
      folio: d.folio,
      folioExterno: d.folioExterno,
      entrega: d.entrega,
      totalClp: d.totales.totalClp,
      netoClp: d.totales.netoClp,
      ivaClp: d.totales.ivaClp,
      exentoClp: d.totales.exentoClp,
      xml: d.xml,
      ted: d.ted,
      siiStatus: d.estadoSii,
    })
    .run();
}

// ---------- Anular ----------

export interface ResultadoAnulacion {
  venta: VentaDetalle;
  /** Qué debe hacer el cajero fuera del sistema (nota de crédito, anular el pago con tarjeta). */
  recordatorio: string | null;
}

/**
 * Anula una venta del turno abierto: la marca como ANULADA (no se borra) y devuelve el stock.
 * `autorizadaPor` es el dueño (por su sesión o por su clave).
 */
export async function anularVenta(
  db: Db,
  datos: {
    ventaId: string;
    autorizadaPorId: string;
    motivo: string;
    soloUltima: boolean;
    usuarioId: string;
  },
): Promise<ResultadoAnulacion> {
  const ahora = new Date();
  db.transaction(() => {
    const v = db.select().from(sales).where(eq(sales.id, datos.ventaId)).get();
    if (!v) throw new ErrorHttp('NO_ENCONTRADO', 'Venta no encontrada', 404);
    if (v.status === 'ANULADA') throw new ErrorHttp('YA_ANULADA', 'La venta ya está anulada', 409);
    const abierta = sesionAbiertaId(db, v.registerId);
    if (!abierta || v.cashSessionId !== abierta) {
      throw new ErrorHttp(
        'SESION_CERRADA',
        'Solo se pueden anular ventas del turno de caja abierto',
        409,
      );
    }
    if (datos.soloUltima && ultimaVentaId(db, v.registerId) !== v.id) {
      throw new ErrorHttp(
        'NO_ES_LA_ULTIMA',
        'El cajero solo puede anular la última venta. Para otras, pide al dueño que entre.',
        403,
      );
    }
    db.update(sales)
      .set({
        status: 'ANULADA',
        voidedAt: ahora,
        voidedBy: datos.autorizadaPorId,
        voidReason: datos.motivo.trim(),
      })
      .where(eq(sales.id, v.id))
      .run();
    const anulada = db.select().from(sales).where(eq(sales.id, v.id)).get();
    /* v8 ignore next -- existe: se acaba de anular */
    if (!anulada) throw new Error('Venta anulada no encontrada');
    encolar(db, {
      entity: 'sales',
      entityId: v.id,
      op: 'UPDATE',
      payload: ventaAWire(anulada, {
        registerName: nombreRegistro(db, v.registerId),
        cashierName: nombreUsuario(db, v.cashierId).name,
      }),
    });
    const items = db.select().from(saleItems).where(eq(saleItems.saleId, v.id)).all();
    for (const i of items) {
      if (!i.productId) continue;
      const m = db
        .insert(stockMovements)
        .values({
          productId: i.productId,
          qtyMilli: i.qtyMilli,
          type: 'ANULACION',
          refId: v.id,
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
        .set({ stockQtyMilli: sql`${products.stockQtyMilli} + ${i.qtyMilli}` })
        .where(eq(products.id, i.productId))
        .run();
    }
  });
  const venta = await obtenerVenta(db, datos.ventaId);
  /* v8 ignore next -- existe: se acaba de anular */
  if (!venta) throw new Error('Venta anulada no encontrada');
  return { venta, recordatorio: recordatorioAnulacion(venta) };
}

// TODO(SII): confirmar el procedimiento de nota de crédito para boletas de e-Boleta (ADR-001 §5).
function recordatorioAnulacion(v: VentaDetalle): string | null {
  const total = formatearClp(v.totalClp);
  if (v.documento?.provider === 'SII_DIRECTO') {
    return `Anula la boleta folio ${v.documento.folio ?? '?'} (${total}) con una nota de crédito electrónica en el SII`;
  }
  if (v.documento?.provider === 'PUENTE_MANUAL') {
    return v.documento.folioExterno
      ? `Anula la boleta folio ${v.documento.folioExterno} (${total}) en sii.cl con una nota de crédito`
      : `Si emitiste la boleta en e-Boleta por ${total}, anúlala en sii.cl con una nota de crédito`;
  }
  if (v.medioPago === 'DEBITO' || v.medioPago === 'CREDITO') {
    return `Anula también el pago de ${total} en la máquina de tarjetas`;
  }
  if (v.medioPago === 'TRANSFERENCIA') return `Devuelve la transferencia de ${total} al cliente`;
  return null;
}

// ---------- Folio SII (e-Boleta) ----------

export async function registrarFolioSii(
  db: Db,
  datos: { ventaId: string; folio: string; esDueno: boolean },
): Promise<VentaDetalle> {
  const folio = normalizarFolioExterno(datos.folio);
  const doc = db.select().from(taxDocuments).where(eq(taxDocuments.saleId, datos.ventaId)).get();
  if (!doc) {
    const existe = db.select({ id: sales.id }).from(sales).where(eq(sales.id, datos.ventaId)).get();
    if (!existe) throw new ErrorHttp('NO_ENCONTRADO', 'Venta no encontrada', 404);
  }
  if (doc?.provider !== 'PUENTE_MANUAL') {
    throw new ErrorHttp(
      'SIN_BOLETA_E_BOLETA',
      'Esta venta no tiene una boleta para emitir en e-Boleta',
      409,
    );
  }
  if (doc.folioExterno !== null && doc.folioExterno !== folio && !datos.esDueno) {
    throw new ErrorHttp(
      'FOLIO_YA_REGISTRADO',
      `Esta venta ya tiene el folio ${doc.folioExterno}. Solo el dueño puede corregirlo.`,
      403,
    );
  }
  db.update(taxDocuments).set({ folioExterno: folio }).where(eq(taxDocuments.id, doc.id)).run();
  const venta = await obtenerVenta(db, datos.ventaId);
  /* v8 ignore next -- existe */
  if (!venta) throw new Error('Venta no encontrada');
  return venta;
}
