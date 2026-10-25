import Database from 'better-sqlite3';
import { rmSync, renameSync } from 'node:fs';
import type { Categoria } from './categorias.js';
import type { ProductoSemilla } from './construir.js';
import type { Plantilla } from './curado.js';

/** Sube cuando cambie el esquema; apps/server lo revisa al abrir la semilla. */
export const VERSION_ESQUEMA = 1;

const ESQUEMA = `
CREATE TABLE seed_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE seed_categories (
  slug TEXT PRIMARY KEY,
  name_es TEXT NOT NULL,
  parent_slug TEXT REFERENCES seed_categories(slug)
);
CREATE TABLE seed_products (
  barcode TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  product_name TEXT NOT NULL,
  quantity_text TEXT,
  net_unit TEXT CHECK (net_unit IN ('G', 'ML', 'UN')),
  net_qty INTEGER,
  category_slug TEXT NOT NULL REFERENCES seed_categories(slug),
  category_via TEXT NOT NULL,
  image_url TEXT,
  source TEXT NOT NULL,
  sources TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('CURADO', 'TAG_CHILE', 'PREFIJO_780')),
  quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  updated_at TEXT
);
CREATE INDEX seed_products_category ON seed_products(category_slug);
CREATE TABLE seed_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category_slug TEXT NOT NULL REFERENCES seed_categories(slug),
  unit TEXT NOT NULL CHECK (unit IN ('UN', 'KG')),
  note TEXT
);
`;

export interface ContenidoSemilla {
  productos: ProductoSemilla[];
  taxonomia: Map<string, Categoria>;
  plantillas: Plantilla[];
  meta: Record<string, string>;
}

/** Categorías con el padre antes que los hijos (por las FK). */
function ordenarCategorias(taxonomia: Map<string, Categoria>): Categoria[] {
  return [...taxonomia.values()].sort(
    (a, b) => Number(a.padre !== null) - Number(b.padre !== null),
  );
}

/**
 * Escribe la semilla en `ruta` desde cero. Se arma en un archivo temporal y se renombra al
 * final: si algo falla, la semilla anterior queda intacta.
 */
export function escribirSemilla(ruta: string, c: ContenidoSemilla): void {
  const tmp = `${ruta}.tmp`;
  rmSync(tmp, { force: true });
  const db = new Database(tmp);
  try {
    db.pragma('foreign_keys = ON');
    db.exec(ESQUEMA);
    db.transaction(() => {
      const meta = db.prepare('INSERT INTO seed_meta (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries({ ...c.meta, schema_version: String(VERSION_ESQUEMA) })) {
        meta.run(k, v);
      }
      const cat = db.prepare(
        'INSERT INTO seed_categories (slug, name_es, parent_slug) VALUES (?, ?, ?)',
      );
      for (const x of ordenarCategorias(c.taxonomia)) cat.run(x.slug, x.nombre, x.padre);
      const prod = db.prepare(`INSERT INTO seed_products (barcode, name, brand, product_name,
        quantity_text, net_unit, net_qty, category_slug, category_via, image_url, source, sources,
        origin, quality_score, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const p of c.productos) {
        prod.run(
          p.barcode,
          p.name,
          p.brand,
          p.productName,
          p.quantityText,
          p.netUnit,
          p.netQty,
          p.categorySlug,
          p.categoryVia,
          p.imageUrl,
          p.source,
          p.sources.join(','),
          p.origin,
          p.qualityScore,
          p.updatedAt,
        );
      }
      const tpl = db.prepare(
        'INSERT INTO seed_templates (name, category_slug, unit, note) VALUES (?, ?, ?, ?)',
      );
      for (const t of c.plantillas) tpl.run(t.nombre, t.categoriaSlug, t.unidad, t.nota || null);
    })();
    db.exec('VACUUM');
  } finally {
    db.close();
  }
  renameSync(tmp, ruta);
}
