/**
 * Modelo local (docs/ARQUITECTURA.md §3). Reglas:
 * - Montos en pesos `INTEGER`; cantidades `INTEGER` en milésimas (ADR-002). Nunca REAL.
 * - Nada se borra: FKs con RESTRICT y `deleted_at` (soft delete) en tablas sincronizadas.
 * - Ids UUIDv7 (ordenables por tiempo, únicos entre caja y nube).
 */
import { MEDIOS_PAGO } from '@almacen/core';
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { v7 as uuidv7 } from 'uuid';

const UNIDADES = ['UN', 'KG'] as const;
const TIPOS_IMPUESTO = ['AFECTO', 'EXENTO'] as const;
const ORIGENES = ['SEED', 'LOCAL'] as const;
export const ROLES = ['DUENO', 'CAJERO'] as const;
export type Rol = (typeof ROLES)[number];
const TIPOS_MOVIMIENTO = ['VENTA', 'RECEPCION', 'AJUSTE', 'MERMA', 'ANULACION'] as const;
const ESTADOS_VENTA = ['OK', 'ANULADA'] as const;
const MODELOS_EMISION = ['SOLO_NO_ELECTRONICOS', 'TODO_MEDIO_PAGO'] as const;
const PROVIDERS = ['MOCK', 'PUENTE_MANUAL', 'SII_DIRECTO', 'PROVEEDOR_EXTERNO'] as const;
const ENTREGAS = ['IMPRESA', 'VIRTUAL'] as const;
const ESTADOS_SII = [
  'NO_APLICA',
  'PENDIENTE',
  'ENVIADO',
  'ACEPTADO',
  'RECHAZADO',
  'REPARO',
] as const;
const OPERACIONES = ['INSERT', 'UPDATE', 'DELETE'] as const;

const MEDIOS = MEDIOS_PAGO as readonly [string, ...string[]];

/** CHECK (col IN ('A','B',...)) para que SQLite rechace valores fuera del enum. */
function enEnum(columna: AnySQLiteColumn, valores: readonly string[]): SQL {
  const lista = valores.map((v) => `'${v}'`).join(', ');
  return sql`${columna} in (${sql.raw(lista)})`;
}

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
const ahora = (nombre: string) =>
  integer(nombre, { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());
const booleano = (nombre: string, porDefecto: boolean) =>
  integer(nombre, { mode: 'boolean' }).notNull().default(porDefecto);

/** Columnas para sincronizar con la nube (ARQUITECTURA §2). */
const sync = () => ({
  createdAt: ahora('created_at'),
  updatedAt: ahora('updated_at'),
  version: integer('version').notNull().default(1),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const storeSettings = sqliteTable(
  'store_settings',
  {
    id: integer('id').primaryKey().default(1),
    rut: text('rut'),
    razonSocial: text('razon_social'),
    giro: text('giro'),
    direccion: text('direccion'),
    comuna: text('comuna'),
    modeloEmision: text('modelo_emision', { enum: MODELOS_EMISION })
      .notNull()
      .default('SOLO_NO_ELECTRONICOS'),
    dteProvider: text('dte_provider', { enum: PROVIDERS }).notNull().default('MOCK'),
    cashRoundingEnabled: booleano('cash_rounding_enabled', true),
    updatedAt: ahora('updated_at'),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    check('store_settings_unica', sql`${t.id} = 1`),
    check('store_settings_modelo', enEnum(t.modeloEmision, MODELOS_EMISION)),
    check('store_settings_provider', enEnum(t.dteProvider, PROVIDERS)),
  ],
);

export const registers = sqliteTable('registers', {
  id: id(),
  name: text('name').notNull(),
  active: booleano('active', true),
});

export const users = sqliteTable(
  'users',
  {
    id: id(),
    name: text('name').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    pinHash: text('pin_hash').notNull(),
    active: booleano('active', true),
    ...sync(),
  },
  (t) => [check('users_role', enEnum(t.role, ROLES))],
);

export const categories = sqliteTable('categories', {
  id: id(),
  name: text('name').notNull(),
  parentId: text('parent_id').references((): AnySQLiteColumn => categories.id),
  ...sync(),
});

export const products = sqliteTable(
  'products',
  {
    id: id(),
    /** NULL en productos sin código (pan, verduras). SQLite permite varios NULL en UNIQUE. */
    barcode: text('barcode').unique(),
    name: text('name').notNull(),
    brand: text('brand'),
    format: text('format'),
    unit: text('unit', { enum: UNIDADES }).notNull().default('UN'),
    categoryId: text('category_id').references(() => categories.id),
    priceClp: integer('price_clp').notNull(),
    costClp: integer('cost_clp'),
    taxType: text('tax_type', { enum: TIPOS_IMPUESTO }).notNull().default('AFECTO'),
    /** ILA, bebidas azucaradas: solo para reportes, no se desglosa en la boleta (SII §5 P7). */
    extraTaxCode: text('extra_tax_code'),
    stockQtyMilli: integer('stock_qty_milli').notNull().default(0),
    stockMinMilli: integer('stock_min_milli'),
    active: booleano('active', true),
    source: text('source', { enum: ORIGENES }).notNull().default('LOCAL'),
    seedRef: text('seed_ref'),
    /** Código de producto dentro de la etiqueta de balanza (prefijos 20–29). */
    scaleCode: text('scale_code').unique(),
    ...sync(),
  },
  (t) => [
    check('products_precio', sql`${t.priceClp} >= 0`),
    check('products_costo', sql`${t.costClp} is null or ${t.costClp} >= 0`),
    check('products_unidad', enEnum(t.unit, UNIDADES)),
    check('products_impuesto', enEnum(t.taxType, TIPOS_IMPUESTO)),
    check('products_origen', enEnum(t.source, ORIGENES)),
    index('products_nombre_idx').on(t.name),
    index('products_categoria_idx').on(t.categoryId),
  ],
);

/** Códigos alternativos (el mismo producto con otro EAN, packs, etc.). */
export const productBarcodes = sqliteTable('product_barcodes', {
  barcode: text('barcode').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
});

export const promotions = sqliteTable(
  'promotions',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    packQty: integer('pack_qty').notNull(),
    packPriceClp: integer('pack_price_clp').notNull(),
    active: booleano('active', true),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    ...sync(),
  },
  (t) => [
    check('promotions_pack', sql`${t.packQty} >= 2`),
    check('promotions_precio', sql`${t.packPriceClp} >= 0`),
    index('promotions_producto_idx').on(t.productId),
  ],
);

export const priceHistory = sqliteTable(
  'price_history',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    oldPrice: integer('old_price').notNull(),
    newPrice: integer('new_price').notNull(),
    changedBy: text('changed_by').references(() => users.id),
    device: text('device'),
    at: ahora('at'),
  },
  (t) => [index('price_history_producto_idx').on(t.productId)],
);

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    /** Con signo: negativo en ventas y mermas. */
    qtyMilli: integer('qty_milli').notNull(),
    type: text('type', { enum: TIPOS_MOVIMIENTO }).notNull(),
    refId: text('ref_id'),
    userId: text('user_id').references(() => users.id),
    at: ahora('at'),
  },
  (t) => [
    check('stock_movements_tipo', enEnum(t.type, TIPOS_MOVIMIENTO)),
    index('stock_movements_producto_idx').on(t.productId),
  ],
);

export const cashSessions = sqliteTable(
  'cash_sessions',
  {
    id: id(),
    registerId: text('register_id')
      .notNull()
      .references(() => registers.id),
    openedBy: text('opened_by')
      .notNull()
      .references(() => users.id),
    openedAt: ahora('opened_at'),
    openingCash: integer('opening_cash').notNull(),
    closedBy: text('closed_by').references(() => users.id),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
    countedCash: integer('counted_cash'),
    /** Efectivo esperado al cerrar (inicial + cobrado en efectivo). Queda fijo para auditoría. */
    expectedCash: integer('expected_cash'),
  },
  (t) => [
    check('cash_sessions_apertura', sql`${t.openingCash} >= 0`),
    // Una sola sesión abierta por caja.
    uniqueIndex('cash_sessions_abierta_uq')
      .on(t.registerId)
      .where(sql`${t.closedAt} is null`),
  ],
);

export const sales = sqliteTable(
  'sales',
  {
    id: id(),
    number: integer('number').notNull(),
    registerId: text('register_id')
      .notNull()
      .references(() => registers.id),
    cashSessionId: text('cash_session_id').references(() => cashSessions.id),
    cashierId: text('cashier_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ESTADOS_VENTA }).notNull().default('OK'),
    /** Total con IVA, sin redondeo de efectivo (= total del documento tributario). */
    totalClp: integer('total_clp').notNull(),
    /** Ajuste Ley 20.956 (−5..+4). Cobrado = total + redondeo. */
    roundingClp: integer('rounding_clp').notNull().default(0),
    paymentMethod: text('payment_method', { enum: MEDIOS }).notNull(),
    paidClp: integer('paid_clp').notNull(),
    changeClp: integer('change_clp').notNull().default(0),
    voidedAt: integer('voided_at', { mode: 'timestamp_ms' }),
    voidedBy: text('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdAt: ahora('created_at'),
  },
  (t) => [
    uniqueIndex('sales_caja_numero_uq').on(t.registerId, t.number),
    check('sales_estado', enEnum(t.status, ESTADOS_VENTA)),
    check('sales_medio_pago', enEnum(t.paymentMethod, MEDIOS)),
    check('sales_total', sql`${t.totalClp} >= 0`),
    check('sales_redondeo', sql`${t.roundingClp} between -5 and 4`),
    check('sales_pagado', sql`${t.paidClp} >= 0 and ${t.changeClp} >= 0`),
    index('sales_fecha_idx').on(t.createdAt),
  ],
);

export const saleItems = sqliteTable(
  'sale_items',
  {
    id: id(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    /** NULL en ventas rápidas sin producto. */
    productId: text('product_id').references(() => products.id),
    nameSnapshot: text('name_snapshot').notNull(),
    unit: text('unit', { enum: UNIDADES }).notNull(),
    qtyMilli: integer('qty_milli').notNull(),
    unitPriceClp: integer('unit_price_clp').notNull(),
    taxType: text('tax_type', { enum: TIPOS_IMPUESTO }).notNull(),
    discountClp: integer('discount_clp').notNull().default(0),
    lineTotalClp: integer('line_total_clp').notNull(),
  },
  (t) => [
    check('sale_items_cantidad', sql`${t.qtyMilli} > 0`),
    check(
      'sale_items_montos',
      sql`${t.unitPriceClp} >= 0 and ${t.discountClp} >= 0 and ${t.lineTotalClp} >= 0`,
    ),
    check('sale_items_unidad', enEnum(t.unit, UNIDADES)),
    check('sale_items_impuesto', enEnum(t.taxType, TIPOS_IMPUESTO)),
    index('sale_items_venta_idx').on(t.saleId),
  ],
);

export const taxDocuments = sqliteTable(
  'tax_documents',
  {
    id: id(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    provider: text('provider', { enum: PROVIDERS }).notNull(),
    /** NULL si no es un DTE propio (mock o puente manual). */
    dteType: integer('dte_type'),
    folio: integer('folio'),
    /** Folio de la app e-Boleta del SII (estrategia D). */
    folioExterno: text('folio_externo'),
    entrega: text('entrega', { enum: ENTREGAS }).notNull().default('IMPRESA'),
    totalClp: integer('total_clp').notNull(),
    netoClp: integer('neto_clp').notNull(),
    ivaClp: integer('iva_clp').notNull(),
    exentoClp: integer('exento_clp').notNull().default(0),
    xml: text('xml'),
    ted: text('ted'),
    trackId: text('track_id'),
    siiStatus: text('sii_status', { enum: ESTADOS_SII }).notNull().default('NO_APLICA'),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: ahora('created_at'),
  },
  (t) => [
    uniqueIndex('tax_documents_folio_uq').on(t.dteType, t.folio),
    check('tax_documents_tipo', sql`${t.dteType} is null or ${t.dteType} in (39, 41)`),
    check('tax_documents_provider', enEnum(t.provider, PROVIDERS)),
    check('tax_documents_entrega', enEnum(t.entrega, ENTREGAS)),
    check('tax_documents_estado', enEnum(t.siiStatus, ESTADOS_SII)),
    check('tax_documents_cuadre', sql`${t.netoClp} + ${t.ivaClp} + ${t.exentoClp} = ${t.totalClp}`),
    index('tax_documents_venta_idx').on(t.saleId),
    index('tax_documents_estado_idx').on(t.siiStatus),
  ],
);

/** Rangos de folios autorizados (CAF). Se usará en Fase 5; el XML va cifrado. */
export const cafRanges = sqliteTable(
  'caf_ranges',
  {
    id: id(),
    dteType: integer('dte_type').notNull(),
    folioFrom: integer('folio_from').notNull(),
    folioTo: integer('folio_to').notNull(),
    nextFolio: integer('next_folio').notNull(),
    xmlEncrypted: text('xml_encrypted').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    check('caf_ranges_tipo', sql`${t.dteType} in (39, 41)`),
    check(
      'caf_ranges_folios',
      sql`${t.folioFrom} <= ${t.folioTo} and ${t.nextFolio} between ${t.folioFrom} and ${t.folioTo} + 1`,
    ),
  ],
);

export const quickButtons = sqliteTable('quick_buttons', {
  id: id(),
  label: text('label').notNull(),
  productId: text('product_id').references(() => products.id),
  position: integer('position').notNull(),
  ...sync(),
});

export const outbox = sqliteTable(
  'outbox',
  {
    id: id(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op', { enum: OPERACIONES }).notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    createdAt: ahora('created_at'),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    check('outbox_op', enEnum(t.op, OPERACIONES)),
    index('outbox_pendientes_idx').on(t.syncedAt),
  ],
);
