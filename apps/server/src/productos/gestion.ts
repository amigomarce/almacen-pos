import { margenPorcentaje, MILI, normalizarCodigoBarras, esCodigoDeBalanza } from '@almacen/core';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import {
  categories,
  priceHistory,
  productBarcodes,
  products,
  saleItems,
  stockMovements,
} from '../db/schema.js';
import { ErrorHttp } from '../errores.js';

export interface ProductoDetalle {
  id: string;
  barcode: string | null;
  barcodesAlternativos: string[];
  name: string;
  brand: string | null;
  format: string | null;
  unit: 'UN' | 'KG';
  categoryId: string | null;
  categoria: string | null;
  priceClp: number;
  costClp: number | null;
  /** Margen sobre el precio (%), `null` sin costo. */
  margen: number | null;
  taxType: 'AFECTO' | 'EXENTO';
  stockQtyMilli: number;
  stockMinMilli: number | null;
  scaleCode: string | null;
  active: boolean;
  source: 'SEED' | 'LOCAL';
  updatedAt: string;
}

export function detalleProducto(db: Db, id: string): ProductoDetalle | null {
  const p = db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .get();
  if (!p) return null;
  const categoria = p.categoryId
    ? (db
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.id, p.categoryId))
        .get()?.name ?? null)
    : null;
  const alternativos = db
    .select({ barcode: productBarcodes.barcode })
    .from(productBarcodes)
    .where(eq(productBarcodes.productId, id))
    .all()
    .map((b) => b.barcode);
  return {
    id: p.id,
    barcode: p.barcode,
    barcodesAlternativos: alternativos,
    name: p.name,
    brand: p.brand,
    format: p.format,
    unit: p.unit,
    categoryId: p.categoryId,
    categoria,
    priceClp: p.priceClp,
    costClp: p.costClp,
    margen: margenPorcentaje(p.priceClp, p.costClp),
    taxType: p.taxType,
    stockQtyMilli: p.stockQtyMilli,
    stockMinMilli: p.stockMinMilli,
    scaleCode: p.scaleCode,
    active: p.active,
    source: p.source,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export interface CambiosProducto {
  name?: string;
  brand?: string | null;
  format?: string | null;
  unit?: 'UN' | 'KG';
  priceClp?: number;
  costClp?: number | null;
  taxType?: 'AFECTO' | 'EXENTO';
  stockMinMilli?: number | null;
  barcode?: string | null;
  scaleCode?: string | null;
  active?: boolean;
}

const texto = (v: string | null | undefined) =>
  v === undefined ? undefined : v?.trim() ? v.trim() : null;

/** Edición del dueño. Un cambio de precio queda en `price_history` (nada se borra). */
export function editarProducto(
  db: Db,
  id: string,
  cambios: CambiosProducto,
  usuarioId: string,
): ProductoDetalle {
  return db.transaction(() => {
    const actual = db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .get();
    if (!actual) throw new ErrorHttp('NO_ENCONTRADO', 'Producto no encontrado', 404);

    let barcode: string | null | undefined = undefined;
    if (cambios.barcode !== undefined) {
      if (cambios.barcode === null || cambios.barcode.trim() === '') barcode = null;
      else {
        barcode = normalizarCodigoBarras(cambios.barcode);
        if (!barcode)
          throw new ErrorHttp('CODIGO_INVALIDO', 'El código de barras no es válido', 400);
        if (esCodigoDeBalanza(barcode)) {
          throw new ErrorHttp(
            'CODIGO_BALANZA',
            'Para la balanza usa el campo "código de balanza"',
            400,
          );
        }
        const otro =
          db
            .select({ id: products.id })
            .from(products)
            .where(and(eq(products.barcode, barcode), ne(products.id, id)))
            .get() ??
          db
            .select({ id: productBarcodes.productId })
            .from(productBarcodes)
            .where(and(eq(productBarcodes.barcode, barcode), ne(productBarcodes.productId, id)))
            .get();
        if (otro)
          throw new ErrorHttp(
            'CODIGO_EXISTE',
            'Ese código ya está registrado en otro producto',
            409,
          );
      }
    }

    const unidad = cambios.unit ?? actual.unit;
    if (cambios.unit !== undefined && cambios.unit !== actual.unit) {
      const conVentas = db
        .select({ id: saleItems.id })
        .from(saleItems)
        .where(eq(saleItems.productId, id))
        .get();
      if (conVentas) {
        throw new ErrorHttp(
          'UNIDAD_CON_VENTAS',
          'No se puede cambiar la unidad de un producto que ya tiene ventas',
          409,
        );
      }
      if (cambios.unit === 'UN' && actual.stockQtyMilli % MILI !== 0) {
        throw new ErrorHttp(
          'STOCK_FRACCIONARIO',
          'El stock actual tiene decimales: cuéntalo antes de pasar a unidades',
          409,
        );
      }
    }

    let scaleCode: string | null | undefined = undefined;
    if (cambios.scaleCode !== undefined) {
      scaleCode =
        cambios.scaleCode === null || cambios.scaleCode.trim() === ''
          ? null
          : cambios.scaleCode.trim();
      if (scaleCode !== null) {
        if (unidad !== 'KG')
          throw new ErrorHttp(
            'BALANZA_SOLO_KG',
            'Solo los productos por kg usan código de balanza',
            400,
          );
        const otro = db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.scaleCode, scaleCode), ne(products.id, id)))
          .get();
        if (otro)
          throw new ErrorHttp(
            'BALANZA_EXISTE',
            'Ese código de balanza ya es de otro producto',
            409,
          );
      }
    }

    if (
      cambios.stockMinMilli !== undefined &&
      cambios.stockMinMilli !== null &&
      unidad === 'UN' &&
      cambios.stockMinMilli % MILI !== 0
    ) {
      throw new ErrorHttp(
        'STOCK_FRACCIONARIO',
        'El stock mínimo de un producto por unidad debe ser entero',
        400,
      );
    }

    const valores = {
      name: texto(cambios.name) ?? undefined,
      brand: texto(cambios.brand),
      format: texto(cambios.format),
      unit: cambios.unit,
      priceClp: cambios.priceClp,
      costClp: cambios.costClp,
      taxType: cambios.taxType,
      stockMinMilli: cambios.stockMinMilli,
      barcode,
      scaleCode,
      active: cambios.active,
    };
    const definidos = Object.fromEntries(
      Object.entries(valores).filter(([, v]) => v !== undefined),
    );
    db.update(products)
      .set({ ...definidos, updatedAt: new Date(), version: actual.version + 1 })
      .where(eq(products.id, id))
      .run();
    if (cambios.priceClp !== undefined && cambios.priceClp !== actual.priceClp) {
      db.insert(priceHistory)
        .values({
          productId: id,
          oldPrice: actual.priceClp,
          newPrice: cambios.priceClp,
          changedBy: usuarioId,
          device: 'caja',
        })
        .run();
    }
    const detalle = detalleProducto(db, id);
    /* v8 ignore next -- existe: se acaba de editar */
    if (!detalle) throw new Error('Producto editado no encontrado');
    return detalle;
  });
}

export type AjusteStock =
  { tipo: 'CONTEO'; stockContadoMilli: number } | { tipo: 'MERMA'; cantidadMilli: number };

/**
 * Conteo: el stock pasa a ser lo contado (movimiento AJUSTE por la diferencia).
 * Merma: se descuenta lo perdido (vencido, roto). Nada se borra: todo queda como movimiento.
 */
export function ajustarStock(
  db: Db,
  id: string,
  ajuste: AjusteStock,
  usuarioId: string,
): ProductoDetalle {
  return db.transaction(() => {
    const p = db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .get();
    if (!p) throw new ErrorHttp('NO_ENCONTRADO', 'Producto no encontrado', 404);
    const cantidad = ajuste.tipo === 'CONTEO' ? ajuste.stockContadoMilli : ajuste.cantidadMilli;
    if (p.unit === 'UN' && cantidad % MILI !== 0) {
      throw new ErrorHttp('STOCK_FRACCIONARIO', 'Un producto por unidad no admite decimales', 400);
    }
    const delta =
      ajuste.tipo === 'CONTEO' ? ajuste.stockContadoMilli - p.stockQtyMilli : -ajuste.cantidadMilli;
    if (delta !== 0) {
      db.insert(stockMovements)
        .values({
          productId: id,
          qtyMilli: delta,
          type: ajuste.tipo === 'CONTEO' ? 'AJUSTE' : 'MERMA',
          userId: usuarioId,
        })
        .run();
      db.update(products)
        .set({ stockQtyMilli: p.stockQtyMilli + delta, updatedAt: new Date() })
        .where(eq(products.id, id))
        .run();
    }
    const detalle = detalleProducto(db, id);
    /* v8 ignore next -- existe */
    if (!detalle) throw new Error('Producto no encontrado');
    return detalle;
  });
}

const TEXTO = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const;
const CANTIDAD = { type: 'integer', minimum: 0, maximum: 1_000_000_000 } as const;

export function registrarGestionProductos(
  app: FastifyInstance,
  { db, sesiones }: { db: Db; sesiones: Sesiones },
): void {
  const soloDueno = requiereSesion(sesiones, ['DUENO']);

  app.get<{ Params: { id: string } }>(
    '/products/:id',
    { onRequest: requiereSesion(sesiones) },
    (req, reply) => {
      const p = detalleProducto(db, req.params.id);
      if (!p)
        return reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Producto no encontrado' });
      return p;
    },
  );

  app.patch<{ Params: { id: string }; Body: CambiosProducto }>(
    '/products/:id',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
            brand: TEXTO(60),
            format: TEXTO(40),
            unit: { type: 'string', enum: ['UN', 'KG'] },
            priceClp: { type: 'integer', minimum: 1, maximum: 100_000_000 },
            costClp: { type: ['integer', 'null'], minimum: 0, maximum: 100_000_000 },
            taxType: { type: 'string', enum: ['AFECTO', 'EXENTO'] },
            stockMinMilli: { type: ['integer', 'null'], minimum: 0, maximum: 1_000_000_000 },
            barcode: TEXTO(20),
            scaleCode: { type: ['string', 'null'], pattern: '^([0-9]{5})?$' },
            active: { type: 'boolean' },
          },
        },
      },
    },
    (req) => {
      const r = editarProducto(db, req.params.id, req.body, req.sesion?.usuario.id ?? '');
      if (req.body.priceClp !== undefined) {
        req.log.info(
          { producto: r.name, precio: r.priceClp, usuario: req.sesion?.usuario.name },
          'Cambio de precio',
        );
      }
      return r;
    },
  );

  app.post<{ Params: { id: string }; Body: AjusteStock }>(
    '/products/:id/stock',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          oneOf: [
            {
              type: 'object',
              required: ['tipo', 'stockContadoMilli'],
              additionalProperties: false,
              properties: { tipo: { const: 'CONTEO' }, stockContadoMilli: CANTIDAD },
            },
            {
              type: 'object',
              required: ['tipo', 'cantidadMilli'],
              additionalProperties: false,
              properties: { tipo: { const: 'MERMA' }, cantidadMilli: { ...CANTIDAD, minimum: 1 } },
            },
          ],
        },
      },
    },
    (req) => ajustarStock(db, req.params.id, req.body, req.sesion?.usuario.id ?? ''),
  );
}
