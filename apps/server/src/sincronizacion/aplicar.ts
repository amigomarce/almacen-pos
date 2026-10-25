import type { CategoriaWire, EventoSync, ProductoWire } from '@almacen/sync';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { categories, priceHistory, products } from '../db/schema.js';

/**
 * Aplica los eventos que bajan de la nube (cambios del dueño). Solo `products` y `categories`
 * bajan; ventas, líneas y movimientos son append-only (solo suben). El dueño gana los
 * conflictos: se aplica si la versión de la nube es más nueva que la local (ARQUITECTURA §2).
 * El stock local nunca se toca (se sincroniza por movimientos, no por el producto).
 */

function aplicarProducto(db: Db, w: ProductoWire): void {
  const local = db.select().from(products).where(eq(products.id, w.id)).get();
  if (!local) {
    // Producto nuevo que viene de la nube: entra sin stock (llega por movimientos después).
    db.insert(products)
      .values({
        id: w.id,
        barcode: w.barcode,
        name: w.name,
        brand: w.brand,
        format: w.format,
        unit: w.unit,
        categoryId: w.categoryId,
        priceClp: w.priceClp,
        costClp: w.costClp,
        taxType: w.taxType,
        extraTaxCode: w.extraTaxCode,
        stockMinMilli: w.stockMinMilli,
        active: w.active,
        source: w.source,
        seedRef: w.seedRef,
        scaleCode: w.scaleCode,
        createdAt: new Date(w.createdAt),
        updatedAt: new Date(w.updatedAt),
        version: w.version,
        deletedAt: w.deletedAt ? new Date(w.deletedAt) : null,
      })
      .run();
    return;
  }
  if (w.version <= local.version) return;
  const precioCambio = w.priceClp !== local.priceClp;
  db.update(products)
    .set({
      barcode: w.barcode,
      name: w.name,
      brand: w.brand,
      format: w.format,
      unit: w.unit,
      categoryId: w.categoryId,
      priceClp: w.priceClp,
      costClp: w.costClp,
      taxType: w.taxType,
      extraTaxCode: w.extraTaxCode,
      stockMinMilli: w.stockMinMilli,
      active: w.active,
      source: w.source,
      seedRef: w.seedRef,
      scaleCode: w.scaleCode,
      version: w.version,
      updatedAt: new Date(w.updatedAt),
    })
    .where(eq(products.id, w.id))
    .run();
  if (precioCambio) {
    // Nada se borra: el cambio de precio que llegó de la nube queda auditado.
    db.insert(priceHistory)
      .values({
        productId: w.id,
        oldPrice: local.priceClp,
        newPrice: w.priceClp,
        changedBy: null,
        device: 'nube',
      })
      .run();
  }
}

function aplicarCategoria(db: Db, w: CategoriaWire): void {
  const local = db.select().from(categories).where(eq(categories.id, w.id)).get();
  if (!local) {
    db.insert(categories)
      .values({
        id: w.id,
        name: w.name,
        parentId: w.parentId,
        createdAt: new Date(w.createdAt),
        updatedAt: new Date(w.updatedAt),
        version: w.version,
        deletedAt: w.deletedAt ? new Date(w.deletedAt) : null,
      })
      .run();
    return;
  }
  if (w.version <= local.version) return;
  db.update(categories)
    .set({
      name: w.name,
      parentId: w.parentId,
      version: w.version,
      updatedAt: new Date(w.updatedAt),
    })
    .where(eq(categories.id, w.id))
    .run();
}

export function aplicarEventos(db: Db, eventos: readonly EventoSync[]): void {
  for (const e of eventos) {
    if (e.entity === 'products') {
      if (e.op === 'DELETE') {
        db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, e.entityId)).run();
      } else {
        aplicarProducto(db, e.payload as ProductoWire);
      }
    } else if (e.entity === 'categories') {
      if (e.op === 'DELETE') {
        db.update(categories)
          .set({ deletedAt: new Date() })
          .where(eq(categories.id, e.entityId))
          .run();
      } else {
        aplicarCategoria(db, e.payload as CategoriaWire);
      }
    }
    // Las demás entidades solo suben.
  }
}
