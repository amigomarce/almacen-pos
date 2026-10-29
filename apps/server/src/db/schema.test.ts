import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirDb, type Db } from './client.js';
import { migrar } from './migrar.js';
import * as t from './schema.js';

let db: Db;

beforeEach(() => {
  db = abrirDb(':memory:');
  migrar(db);
});

const tablas = (): string[] =>
  db.$client
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%' order by name",
    )
    .all()
    .map((r) => (r as { name: string }).name);

function base() {
  const [caja] = db.insert(t.registers).values({ name: 'Caja 1' }).returning().all();
  const [user] = db
    .insert(t.users)
    .values({ name: 'Dueño', role: 'DUENO', pinHash: 'x' })
    .returning()
    .all();
  const [prod] = db
    .insert(t.products)
    .values({ name: 'Bebida', barcode: '7800000000009', priceClp: 1290 })
    .returning()
    .all();
  if (!caja || !user || !prod) throw new Error('seed de test falló');
  return { caja, user, prod };
}

describe('migraciones', () => {
  it('crean todas las tablas del modelo', () => {
    expect(tablas()).toEqual(
      [
        'caf_ranges',
        'cash_movements',
        'cash_sessions',
        'categories',
        'outbox',
        'price_history',
        'product_barcodes',
        'products',
        'promotions',
        'quick_buttons',
        'registers',
        'sale_items',
        'sales',
        'stock_movements',
        'store_settings',
        'tax_documents',
        'unexpected_shutdowns',
        'users',
      ].sort(),
    );
  });

  it('son idempotentes', () => {
    expect(() => {
      migrar(db);
    }).not.toThrow();
  });

  it('activan claves foráneas', () => {
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('restricciones', () => {
  it('ids UUIDv7 y valores por defecto', () => {
    const { prod } = base();
    expect(prod.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(prod).toMatchObject({
      unit: 'UN',
      taxType: 'AFECTO',
      stockQtyMilli: 0,
      source: 'LOCAL',
      version: 1,
      deletedAt: null,
      active: true,
    });
  });

  it('store_settings es una sola fila con modelo de emisión por defecto', () => {
    db.insert(t.storeSettings).values({}).run();
    const [s] = db.select().from(t.storeSettings).all();
    expect(s).toMatchObject({
      id: 1,
      modeloEmision: 'SOLO_NO_ELECTRONICOS',
      dteProvider: 'PUENTE_MANUAL', // instalación real (ADR-001); MOCK solo en db:seed
      cashRoundingEnabled: true,
    });
    expect(() => db.insert(t.storeSettings).values({ id: 2 }).run()).toThrow(/CHECK/);
  });

  it('rechaza precio negativo', () => {
    expect(() => db.insert(t.products).values({ name: 'X', priceClp: -1 }).run()).toThrow(/CHECK/);
  });

  it('rechaza valores fuera de los enums', () => {
    const malo = {
      name: 'X',
      priceClp: 1,
      unit: 'LT',
    } as unknown as typeof t.products.$inferInsert;
    expect(() => db.insert(t.products).values(malo).run()).toThrow(/CHECK/);
  });

  it('código de barras único, pero varios productos sin código', () => {
    base();
    expect(() =>
      db.insert(t.products).values({ name: 'Otra', barcode: '7800000000009', priceClp: 1 }).run(),
    ).toThrow(/UNIQUE/);
    db.insert(t.products).values({ name: 'Pan', unit: 'KG', priceClp: 1990 }).run();
    db.insert(t.products).values({ name: 'Tomate', unit: 'KG', priceClp: 1490 }).run();
    expect(db.select().from(t.products).all()).toHaveLength(3);
  });

  it('nada se borra: no se puede eliminar un producto con ventas', () => {
    const { caja, user, prod } = base();
    const [venta] = db
      .insert(t.sales)
      .values({
        number: 1,
        registerId: caja.id,
        cashierId: user.id,
        totalClp: 1290,
        roundingClp: 0,
        paymentMethod: 'EFECTIVO',
        paidClp: 2000,
        changeClp: 710,
      })
      .returning()
      .all();
    if (!venta) throw new Error();
    db.insert(t.saleItems)
      .values({
        saleId: venta.id,
        productId: prod.id,
        nameSnapshot: prod.name,
        unit: 'UN',
        qtyMilli: 1000,
        unitPriceClp: 1290,
        taxType: 'AFECTO',
        lineTotalClp: 1290,
      })
      .run();
    expect(() => db.delete(t.products).where(eq(t.products.id, prod.id)).run()).toThrow(
      /FOREIGN KEY/,
    );
  });

  it('número de venta único por caja y redondeo dentro de -5..4', () => {
    const { caja, user } = base();
    const venta = {
      number: 1,
      registerId: caja.id,
      cashierId: user.id,
      totalClp: 1295,
      roundingClp: -5,
      paymentMethod: 'EFECTIVO' as const,
      paidClp: 1290,
    };
    db.insert(t.sales).values(venta).run();
    expect(() => db.insert(t.sales).values(venta).run()).toThrow(/UNIQUE/);
    expect(() =>
      db
        .insert(t.sales)
        .values({ ...venta, number: 2, roundingClp: 6 })
        .run(),
    ).toThrow(/CHECK/);
  });

  it('tax_documents: puente manual sin DTE, con folio externo, y cuadre obligatorio', () => {
    const { caja, user } = base();
    const [venta] = db
      .insert(t.sales)
      .values({
        number: 1,
        registerId: caja.id,
        cashierId: user.id,
        totalClp: 1190,
        paymentMethod: 'TRANSFERENCIA',
        paidClp: 1190,
      })
      .returning()
      .all();
    if (!venta) throw new Error();
    const doc = {
      saleId: venta.id,
      provider: 'PUENTE_MANUAL' as const,
      folioExterno: '123',
      entrega: 'VIRTUAL' as const,
      totalClp: 1190,
      netoClp: 1000,
      ivaClp: 190,
    };
    const [guardado] = db.insert(t.taxDocuments).values(doc).returning().all();
    expect(guardado).toMatchObject({ dteType: null, folio: null, siiStatus: 'NO_APLICA' });
    expect(() =>
      db
        .insert(t.taxDocuments)
        .values({ ...doc, ivaClp: 191 })
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .insert(t.taxDocuments)
        .values({ ...doc, dteType: 33 })
        .run(),
    ).toThrow(/CHECK/);
  });

  it('cantidades en milésimas como enteros', () => {
    const { prod } = base();
    db.insert(t.stockMovements)
      .values({ productId: prod.id, qtyMilli: -1250, type: 'VENTA' })
      .run();
    const [m] = db.select().from(t.stockMovements).all();
    expect(m?.qtyMilli).toBe(-1250);
    expect(Number.isInteger(m?.qtyMilli)).toBe(true);
  });
});
