import { validarCodigoBarras } from '@almacen/core';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { verificarPin } from '../auth/pin.js';
import { abrirDb } from './client.js';
import { migrar } from './migrar.js';
import { sembrar } from './seed.js';
import * as t from './schema.js';

function dbSembrada() {
  const db = abrirDb(':memory:');
  migrar(db);
  expect(sembrar(db)).toBe(true);
  return db;
}

describe('seed', () => {
  it('crea configuración, caja, usuarios y productos', () => {
    const db = dbSembrada();
    expect(db.select().from(t.storeSettings).all()).toHaveLength(1);
    expect(db.select().from(t.registers).all()).toHaveLength(1);
    expect(db.select().from(t.products).all().length).toBeGreaterThanOrEqual(10);
    expect(db.select().from(t.quickButtons).all()).toHaveLength(3);
    expect(db.select().from(t.promotions).all()).toHaveLength(1);
  });

  it('es idempotente', () => {
    const db = dbSembrada();
    const antes = db.select().from(t.products).all().length;
    expect(sembrar(db)).toBe(false);
    expect(db.select().from(t.products).all()).toHaveLength(antes);
  });

  it('cubre los casos del almacén: sin código, por kg, balanza, exento, ILA', () => {
    const p = dbSembrada().select().from(t.products).all();
    expect(p.some((x) => x.barcode === null && x.unit === 'UN')).toBe(true);
    expect(p.some((x) => x.unit === 'KG' && x.barcode === null)).toBe(true);
    expect(p.some((x) => x.scaleCode !== null)).toBe(true);
    expect(p.some((x) => x.taxType === 'EXENTO')).toBe(true);
    expect(p.some((x) => x.extraTaxCode === 'ILA')).toBe(true);
  });

  it('todos los códigos de barras son válidos', () => {
    const db = dbSembrada();
    const codigos = [
      ...db
        .select({ c: t.products.barcode })
        .from(t.products)
        .all()
        .map((r) => r.c),
      ...db
        .select({ c: t.productBarcodes.barcode })
        .from(t.productBarcodes)
        .all()
        .map((r) => r.c),
    ].filter((c): c is string => c !== null);
    expect(codigos.length).toBeGreaterThan(0);
    for (const c of codigos) expect(validarCodigoBarras(c).valido).toBe(true);
  });

  it('el stock de cada producto coincide con sus movimientos', () => {
    const db = dbSembrada();
    for (const p of db.select().from(t.products).all()) {
      const [suma] = db
        .select({ total: sql<number>`coalesce(sum(${t.stockMovements.qtyMilli}), 0)` })
        .from(t.stockMovements)
        .where(eq(t.stockMovements.productId, p.id))
        .all();
      expect(suma?.total).toBe(p.stockQtyMilli);
    }
  });

  it('PINs de prueba funcionan', () => {
    const db = dbSembrada();
    const [dueno] = db.select().from(t.users).where(eq(t.users.role, 'DUENO')).all();
    expect(dueno && verificarPin('1234', dueno.pinHash)).toBe(true);
  });
});
