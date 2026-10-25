/**
 * Base semilla de productos chilenos (`data/out/seed.sqlite`, ODbL, ver ADR-004).
 * Se abre en solo lectura: la caja nunca la modifica. Los productos del local viven en la
 * base local (`products`); la semilla solo sugiere nombre, marca, formato y categoría.
 */
import { existsSync } from 'node:fs';
import { VERSION_ESQUEMA } from '@almacen/data';
import Database from 'better-sqlite3';

export interface FilaSemilla {
  barcode: string;
  name: string;
  brand: string | null;
  quantity_text: string | null;
  category_slug: string;
  image_url: string | null;
}

export class Semilla {
  private readonly buscarStmt: Database.Statement<[string], FilaSemilla>;
  readonly meta: Readonly<Record<string, string>>;

  private constructor(private readonly db: Database.Database) {
    this.meta = Object.fromEntries(
      db
        .prepare<[], { key: string; value: string }>('SELECT key, value FROM seed_meta')
        .all()
        .map((f) => [f.key, f.value]),
    );
    const version = this.meta['schema_version'];
    if (version !== String(VERSION_ESQUEMA)) {
      throw new Error(
        `La semilla tiene schema_version ${version ?? '(sin versión)'} y se esperaba ${VERSION_ESQUEMA}. ` +
          'Regenérala con `pnpm data:build`.',
      );
    }
    this.buscarStmt = db.prepare(
      `SELECT barcode, name, brand, quantity_text, category_slug, image_url
       FROM seed_products WHERE barcode = ?`,
    );
  }

  /**
   * Abre la semilla en solo lectura. Devuelve `null` si el archivo no existe (la caja
   * funciona igual, sin sugerencias). Lanza un error si existe pero no es compatible.
   */
  static abrir(ruta: string): Semilla | null {
    if (!existsSync(ruta)) return null;
    const db = new Database(ruta, { readonly: true, fileMustExist: true });
    try {
      return new Semilla(db);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  /** Busca por código canónico (EAN-13/EAN-8, UPC-A ya convertido a EAN-13). */
  buscar(barcode: string): FilaSemilla | null {
    return this.buscarStmt.get(barcode) ?? null;
  }

  cerrar(): void {
    this.db.close();
  }
}
