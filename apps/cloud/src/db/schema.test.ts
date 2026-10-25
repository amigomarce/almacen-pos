import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Prueba el SQL real de las migraciones (el artefacto que se aplica a Supabase) contra una
 * Postgres en memoria. Se usa SQL crudo porque pg-mem devuelve filas como objetos y el driver
 * de Drizzle espera arreglos (`rowMode: 'array'`); eso no afecta la validación de restricciones,
 * que es lo que aquí importa.
 */

interface PoolMemoria {
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../drizzle', import.meta.url));

function leerMigraciones(): string[] {
  return readdirSync(CARPETA_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`${CARPETA_MIGRACIONES}/${f}`, 'utf8'));
}

let pool: PoolMemoria;

beforeEach(async () => {
  const mem = newDb();
  // pg-mem tipa `createPg().Pool` como `any`; lo acotamos a lo que usamos.
  const PoolMemoria = mem.adapters.createPg().Pool as unknown as new () => PoolMemoria;
  pool = new PoolMemoria();
  for (const sql of leerMigraciones()) {
    for (const q of sql.split('--> statement-breakpoint')) {
      const s = q.trim();
      if (s) await pool.query(s);
    }
  }
});

const producto = (columnas: string, valores: string) =>
  pool.query(`insert into products ${columnas} values ${valores}`);

describe('migraciones', () => {
  it('crean todas las tablas del modelo', async () => {
    const r = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name not like '__drizzle%'
       order by table_name`,
    );
    const tablas = r.rows.map((f) => f['table_name']).sort();
    expect(tablas).toEqual(
      [
        'categories',
        'installations',
        'outbox',
        'products',
        'sale_items',
        'sales',
        'stock_movements',
      ].sort(),
    );
  });
});

describe('restricciones', () => {
  it('rechaza precio negativo', async () => {
    await expect(
      producto(
        '(id, owner_id, name, price_clp, created_at, updated_at)',
        `('p1', 'u1', 'X', -1, now(), now())`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('rechaza unidad e impuesto fuera de los enums', async () => {
    await expect(
      producto(
        '(id, owner_id, name, price_clp, unit, created_at, updated_at)',
        `('p1', 'u1', 'X', 1, 'LT', now(), now())`,
      ),
    ).rejects.toThrow(/check/i);
    await expect(
      producto(
        '(id, owner_id, name, price_clp, tax_type, created_at, updated_at)',
        `('p1', 'u1', 'X', 1, 'MIXTO', now(), now())`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('código de barras único por local, y varios productos sin código', async () => {
    await producto(
      '(id, owner_id, name, price_clp, barcode, created_at, updated_at)',
      `('p1', 'u1', 'A', 100, '7800000000009', now(), now())`,
    );
    await expect(
      producto(
        '(id, owner_id, name, price_clp, barcode, created_at, updated_at)',
        `('p2', 'u1', 'B', 100, '7800000000009', now(), now())`,
      ),
    ).rejects.toThrow(/duplicate|unique/i);
    // Sin código (NULL) se puede repetir.
    await producto(
      '(id, owner_id, name, price_clp, created_at, updated_at)',
      `('p3', 'u1', 'Pan', 1990, now(), now())`,
    );
    await producto(
      '(id, owner_id, name, price_clp, created_at, updated_at)',
      `('p4', 'u1', 'Tomate', 1490, now(), now())`,
    );
  });

  it('el mismo código puede existir en locales distintos', async () => {
    await producto(
      '(id, owner_id, name, price_clp, barcode, created_at, updated_at)',
      `('p1', 'u1', 'A', 100, '7800000000009', now(), now())`,
    );
    await producto(
      '(id, owner_id, name, price_clp, barcode, created_at, updated_at)',
      `('p2', 'u2', 'B', 100, '7800000000009', now(), now())`,
    );
    const r = await pool.query(`select count(*)::int as n from products`);
    expect(r.rows[0]?.['n']).toBe(2);
  });

  it('ventas: número único por caja y redondeo dentro de -5..4', async () => {
    const venta = (id: string, number: number, rounding = 0) =>
      pool.query(
        `insert into sales (id, owner_id, number, register_id, total_clp, rounding_clp, payment_method, created_at)
         values ('${id}', 'u1', ${number}, 'caja1', 1295, ${rounding}, 'EFECTIVO', now())`,
      );
    await venta('s1', 1, -5);
    await expect(venta('s2', 1)).rejects.toThrow(/duplicate|unique/i);
    await expect(venta('s3', 2, 6)).rejects.toThrow(/check/i);
    await expect(
      pool.query(
        `insert into sales (id, owner_id, number, register_id, total_clp, payment_method, created_at)
         values ('s4', 'u1', 1, 'caja2', 100, 'EFECTIVO', now())`,
      ),
    ).resolves.toBeTruthy();
  });

  it('rechaza medio de pago desconocido', async () => {
    await expect(
      pool.query(
        `insert into sales (id, owner_id, number, register_id, total_clp, payment_method, created_at)
         values ('s1', 'u1', 1, 'caja1', 100, 'BITCOIN', now())`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('movimientos de stock con cantidad estrictamente positiva en valor absoluto y tipo válido', async () => {
    await pool.query(
      `insert into stock_movements (id, owner_id, product_id, qty_milli, type, at)
       values ('m1', 'u1', 'p1', -1250, 'VENTA', now())`,
    );
    await expect(
      pool.query(
        `insert into stock_movements (id, owner_id, product_id, qty_milli, type, at)
         values ('m2', 'u1', 'p1', 100, 'OTRO', now())`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('líneas de venta con cantidad positiva y montos no negativos', async () => {
    const linea = (id: string, qty: number) =>
      pool.query(
        `insert into sale_items (id, sale_id, name_snapshot, unit, qty_milli, unit_price_clp, tax_type, line_total_clp)
         values ('${id}', 's1', 'X', 'UN', ${qty}, 100, 'AFECTO', 100)`,
      );
    await linea('si1', 1000);
    await expect(linea('si2', 0)).rejects.toThrow(/check/i);
    await expect(
      pool.query(
        `insert into sale_items (id, sale_id, name_snapshot, unit, qty_milli, unit_price_clp, tax_type, line_total_clp)
         values ('si3', 's1', 'X', 'UN', 1000, -1, 'AFECTO', 100)`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('outbox: payload jsonb y operación válida', async () => {
    await pool.query(
      `insert into outbox (id, owner_id, entity, entity_id, op, payload, created_at)
       values ('o1', 'u1', 'products', 'p1', 'UPDATE', '{"priceClp": 1500}', now())`,
    );
    const r = await pool.query(`select payload from outbox where id = 'o1'`);
    expect(r.rows[0]?.['payload']).toEqual({ priceClp: 1500 });
    await expect(
      pool.query(
        `insert into outbox (id, owner_id, entity, entity_id, op, payload, created_at)
         values ('o2', 'u1', 'products', 'p1', 'BORRAR', '{}', now())`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('vinculación: instalación sin dueño y token único', async () => {
    await pool.query(
      `insert into installations (id, name, token_hash, created_at, updated_at)
       values ('i1', 'Caja 1', 'abc', now(), now())`,
    );
    await expect(
      pool.query(
        `insert into installations (id, name, token_hash, created_at, updated_at)
         values ('i2', 'Caja 2', 'abc', now(), now())`,
      ),
    ).rejects.toThrow(/duplicate|unique/i);
    // owner_id y linked_at pueden quedar NULL hasta que el dueño escanee el QR.
    const r = await pool.query(`select owner_id, linked_at from installations where id = 'i1'`);
    expect(r.rows[0]).toEqual({ owner_id: null, linked_at: null });
  });
});
