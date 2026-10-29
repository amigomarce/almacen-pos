/**
 * Modelo de la nube (apps/cloud, PostgreSQL/Supabase). Es un espejo del local
 * (docs/ARQUITECTURA.md §2–§3): la caja nunca depende de él para vender.
 *
 * Reglas:
 * - Montos en pesos `INTEGER`; cantidades `INTEGER` en milésimas (ADR-002). Nunca REAL.
 * - Ids UUIDv7 (los mismos que genera la caja): las filas llegan con su `id` original, sin
 *   reasignar. Así las sincronizaciones son idempotentes (reinsertar → conflicto de PK).
 * - Multi-local: cada fila lleva `owner_id` (el usuario de Supabase Auth dueño del local).
 * - Los espejos (`products`, `categories`, `sales`, `stock_movements`) NO referencian con FK
 *   a otras tablas: el orden de llegada de la cola puede traer el movimiento antes que el
 *   producto. Se filtran por `owner_id` en la API.
 */
import { MEDIOS_PAGO } from '@almacen/core';
import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

const UNIDADES = ['UN', 'KG'] as const;
const TIPOS_IMPUESTO = ['AFECTO', 'EXENTO'] as const;
const ORIGENES = ['SEED', 'LOCAL'] as const;
const TIPOS_MOVIMIENTO = ['VENTA', 'RECEPCION', 'AJUSTE', 'MERMA', 'ANULACION'] as const;
const ESTADOS_VENTA = ['OK', 'ANULADA'] as const;
const OPERACIONES = ['INSERT', 'UPDATE', 'DELETE'] as const;

const MEDIOS = MEDIOS_PAGO as readonly [string, ...string[]];

/** CHECK (col IN ('A','B',...)) para que Postgres rechace valores fuera del enum. */
function enEnum(columna: AnyPgColumn, valores: readonly string[]): SQL {
  const lista = valores.map((v) => `'${v}'`).join(', ');
  return sql`${columna} in (${sql.raw(lista)})`;
}

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
/** Marca de tiempo con zona horaria, por defecto "ahora" (valor dado por la app o el sync). */
const ahora = (nombre: string) =>
  timestamp(nombre, { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date());
const booleano = (nombre: string, porDefecto: boolean) =>
  boolean(nombre).notNull().default(porDefecto);

/**
 * Columnas de sincronización (ARQUITECTURA §2). En los espejos el valor llega desde la caja;
 * el dueño (nube) gana los conflictos de precio/producto, por eso `version` y `updated_at`
 * se pisan cuando el dueño edita.
 */
const sync = () => ({
  createdAt: ahora('created_at'),
  updatedAt: ahora('updated_at'),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/** Instalación de la caja. El dueño la vincula escaneando un QR (token por instalación). */
export const installations = pgTable(
  'installations',
  {
    id: id(),
    name: text('name').notNull(),
    /** SHA-256 del token de sincronización; nunca se guarda el token en claro. */
    tokenHash: text('token_hash').notNull(),
    /** `auth.users.id` de Supabase; NULL hasta que el dueño escanea el QR. */
    ownerId: text('owner_id'),
    linkedAt: timestamp('linked_at', { withTimezone: true }),
    createdAt: ahora('created_at'),
    updatedAt: ahora('updated_at'),
  },
  (t) => [uniqueIndex('installations_token_hash_uq').on(t.tokenHash)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    ...sync(),
  },
  (t) => [index('categories_owner_idx').on(t.ownerId), index('categories_nombre_idx').on(t.name)],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    ownerId: text('owner_id').notNull(),
    /** NULL en productos sin código (pan, verduras). Un UNIQUE admite varios NULL. */
    barcode: text('barcode'),
    name: text('name').notNull(),
    brand: text('brand'),
    format: text('format'),
    unit: text('unit').notNull().default('UN'),
    categoryId: text('category_id'),
    priceClp: integer('price_clp').notNull(),
    costClp: integer('cost_clp'),
    taxType: text('tax_type').notNull().default('AFECTO'),
    /** ILA, bebidas azucaradas: solo reportes (no se desglosa en la boleta). */
    extraTaxCode: text('extra_tax_code'),
    /** Sin saldo de stock: se deriva de `stock_movements` (nunca se sobrescribe, §2). */
    stockMinMilli: integer('stock_min_milli'),
    active: booleano('active', true),
    source: text('source').notNull().default('LOCAL'),
    seedRef: text('seed_ref'),
    scaleCode: text('scale_code'),
    ...sync(),
  },
  (t) => [
    check('products_precio', sql`${t.priceClp} >= 0`),
    check('products_costo', sql`${t.costClp} is null or ${t.costClp} >= 0`),
    check('products_unidad', enEnum(t.unit, UNIDADES)),
    check('products_impuesto', enEnum(t.taxType, TIPOS_IMPUESTO)),
    check('products_origen', enEnum(t.source, ORIGENES)),
    uniqueIndex('products_barcode_uq').on(t.ownerId, t.barcode),
    uniqueIndex('products_scale_code_uq').on(t.ownerId, t.scaleCode),
    index('products_owner_idx').on(t.ownerId),
    index('products_nombre_idx').on(t.name),
    index('products_marca_idx').on(t.ownerId, t.brand),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    ownerId: text('owner_id').notNull(),
    productId: text('product_id').notNull(),
    /** Con signo: negativo en ventas y mermas. */
    qtyMilli: integer('qty_milli').notNull(),
    type: text('type').notNull(),
    refId: text('ref_id'),
    userId: text('user_id'),
    /** Cuándo ocurrió en la caja (viene en el payload del sync, no "ahora"). */
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('stock_movements_tipo', enEnum(t.type, TIPOS_MOVIMIENTO)),
    index('stock_movements_owner_idx').on(t.ownerId),
    index('stock_movements_producto_idx').on(t.productId),
  ],
);

export const sales = pgTable(
  'sales',
  {
    id: id(),
    ownerId: text('owner_id').notNull(),
    number: integer('number').notNull(),
    registerId: text('register_id').notNull(),
    /** Nombre de la caja al vender (snapshot: no hay tabla `registers` en la nube). */
    registerName: text('register_name'),
    /** Nombre del cajero al vender (snapshot: no hay tabla `users` en la nube). */
    cashierName: text('cashier_name'),
    status: text('status').notNull().default('OK'),
    /** Total con IVA, sin redondeo de efectivo (igual que el local). */
    totalClp: integer('total_clp').notNull(),
    roundingClp: integer('rounding_clp').notNull().default(0),
    paymentMethod: text('payment_method').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    /** Cuándo se vendió en la caja (viene en el payload; no es la hora de sincronización). */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('sales_estado', enEnum(t.status, ESTADOS_VENTA)),
    check('sales_medio_pago', enEnum(t.paymentMethod, MEDIOS)),
    check('sales_total', sql`${t.totalClp} >= 0`),
    check('sales_redondeo', sql`${t.roundingClp} between -5 and 4`),
    uniqueIndex('sales_registro_numero_uq').on(t.ownerId, t.registerId, t.number),
    index('sales_owner_fecha_idx').on(t.ownerId, t.createdAt),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: id(),
    saleId: text('sale_id').notNull(),
    /** NULL en ventas rápidas sin producto; texto plano (sin FK, igual que el resto). */
    productId: text('product_id'),
    nameSnapshot: text('name_snapshot').notNull(),
    unit: text('unit').notNull(),
    qtyMilli: integer('qty_milli').notNull(),
    unitPriceClp: integer('unit_price_clp').notNull(),
    taxType: text('tax_type').notNull(),
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

/**
 * Devolución parcial que hizo la caja (ADR-021). Espejo append-only: los ítems viajan en JSON
 * para restar lo devuelto en los reportes del dueño.
 */
/** Vecinos con cuenta corriente (fiado, ADR-022). Espejo de la caja. */
export const customers = pgTable(
  'customers',
  {
    id: id(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    note: text('note'),
    creditLimitClp: integer('credit_limit_clp'),
    active: booleano('active', true),
    ...sync(),
  },
  (t) => [index('customers_owner_idx').on(t.ownerId)],
);

/** Cuenta corriente del vecino (append-only): positivo aumenta la deuda, negativo la baja. */
export const customerLedger = pgTable(
  'customer_ledger',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    customerId: text('customer_id').notNull(),
    type: text('type').notNull(),
    amountClp: integer('amount_clp').notNull(),
    saleId: text('sale_id'),
    returnId: text('return_id'),
    paymentMethod: text('payment_method'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('customer_ledger_owner_cliente_idx').on(t.ownerId, t.customerId),
    check('customer_ledger_monto', sql`${t.amountClp} <> 0`),
  ],
);

export const saleReturns = pgTable(
  'sale_returns',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    saleId: text('sale_id').notNull(),
    registerId: text('register_id').notNull(),
    refundClp: integer('refund_clp').notNull(),
    roundingClp: integer('rounding_clp').notNull().default(0),
    paymentMethod: text('payment_method').notNull(),
    reason: text('reason').notNull(),
    items: jsonb('items')
      .$type<
        {
          saleItemId: string;
          productId: string | null;
          nameSnapshot: string;
          qtyMilli: number;
          amountClp: number;
        }[]
      >()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('sale_returns_monto', sql`${t.refundClp} >= 0`),
    check('sale_returns_medio_pago', enEnum(t.paymentMethod, MEDIOS)),
    index('sale_returns_owner_fecha_idx').on(t.ownerId, t.createdAt),
  ],
);

/**
 * Cola de eventos de la nube hacia cada caja (cambios del dueño: precios, productos, …).
 * La caja hace pull y marca `synced_at`; espejo de la `outbox` local (que va al revés).
 */
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    ownerId: text('owner_id').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: ahora('created_at'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (t) => [
    check('outbox_op', enEnum(t.op, OPERACIONES)),
    index('outbox_pendientes_idx').on(t.ownerId, t.syncedAt),
  ],
);

/** Cierres de caja que la caja sube, para mostrar el aviso al dueño en el móvil. */
/**
 * Respaldos cifrados que la caja sube a Storage. El objeto vive fuera de Postgres; aquí solo
 * quedan metadatos para listar, retener y restaurar.
 */
export const backups = pgTable(
  'backups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    ownerId: text('owner_id').notNull(),
    installationId: text('installation_id').notNull(),
    filename: text('filename').notNull(),
    objectKey: text('object_key').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256'),
    createdAt: ahora('created_at'),
  },
  (t) => [
    check('backups_tamano', sql`${t.sizeBytes} >= 0`),
    index('backups_dueno_idx').on(t.ownerId, t.installationId, t.createdAt),
    uniqueIndex('backups_objeto_uq').on(t.objectKey),
  ],
);

export const cashCloses = pgTable(
  'cash_closes',
  {
    /** Mismo id que la sesión de caja del local (UUIDv7). */
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    registerId: text('register_id').notNull(),
    registerName: text('register_name'),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
    countedCashClp: integer('counted_cash_clp').notNull(),
    expectedCashClp: integer('expected_cash_clp').notNull(),
    differenceClp: integer('difference_clp').notNull(),
    totalVentasClp: integer('total_ventas_clp').notNull(),
    cantidadVentas: integer('cantidad_ventas').notNull(),
  },
  (t) => [index('cash_closes_owner_idx').on(t.ownerId, t.closedAt)],
);
