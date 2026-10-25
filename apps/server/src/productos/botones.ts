import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import { products, quickButtons } from '../db/schema.js';
import { ErrorHttp } from '../errores.js';
import type { ProductoBuscado } from './busqueda.js';

/** Máximo de botones de venta rápida en la pantalla de venta. */
export const MAX_BOTONES = 24;

export interface BotonRapido {
  id: string;
  label: string;
  posicion: number;
  /** `null` = monto libre con este nombre (ej. "Varios", "Bolsa"). */
  producto: ProductoBuscado | null;
}

/** Botones activos en orden. Los de productos desactivados no se muestran. */
export function listarBotones(db: Db): BotonRapido[] {
  const filas = db
    .select({ b: quickButtons, p: products })
    .from(quickButtons)
    .leftJoin(products, eq(quickButtons.productId, products.id))
    .where(isNull(quickButtons.deletedAt))
    .orderBy(asc(quickButtons.position))
    .all();
  return filas.flatMap(({ b, p }): BotonRapido[] => {
    if (b.productId && (!p?.active || p.deletedAt)) return [];
    return [
      {
        id: b.id,
        label: b.label,
        posicion: b.position,
        producto: p
          ? {
              id: p.id,
              barcode: p.barcode,
              name: p.name,
              brand: p.brand,
              format: p.format,
              unit: p.unit,
              priceClp: p.priceClp,
              stockQtyMilli: p.stockQtyMilli,
              taxType: p.taxType,
            }
          : null,
      },
    ];
  });
}

/** Reemplaza todos los botones (los anteriores quedan marcados como borrados, no se eliminan). */
export function guardarBotones(
  db: Db,
  botones: readonly { label: string; productoId: string | null }[],
): BotonRapido[] {
  const ids = [...new Set(botones.flatMap((b) => (b.productoId ? [b.productoId] : [])))];
  const activos = new Set(
    ids.length
      ? db
          .select({ id: products.id })
          .from(products)
          .where(
            and(inArray(products.id, ids), eq(products.active, true), isNull(products.deletedAt)),
          )
          .all()
          .map((p) => p.id)
      : [],
  );
  const faltante = ids.find((id) => !activos.has(id));
  if (faltante)
    throw new ErrorHttp(
      'PRODUCTO_NO_ENCONTRADO',
      'Un botón apunta a un producto que no existe o está desactivado',
      400,
    );

  const ahora = new Date();
  db.transaction(() => {
    db.update(quickButtons)
      .set({ deletedAt: ahora, updatedAt: ahora })
      .where(isNull(quickButtons.deletedAt))
      .run();
    botones.forEach((b, i) => {
      db.insert(quickButtons)
        .values({ label: b.label.trim(), productId: b.productoId, position: i + 1 })
        .run();
    });
  });
  return listarBotones(db);
}

export function registrarBotones(
  app: FastifyInstance,
  { db, sesiones }: { db: Db; sesiones: Sesiones },
): void {
  app.get('/quick-buttons', { onRequest: requiereSesion(sesiones) }, () => listarBotones(db));

  app.put<{ Body: { botones: { label: string; productoId: string | null }[] } }>(
    '/quick-buttons',
    {
      onRequest: requiereSesion(sesiones, ['DUENO']),
      schema: {
        body: {
          type: 'object',
          required: ['botones'],
          additionalProperties: false,
          properties: {
            botones: {
              type: 'array',
              maxItems: MAX_BOTONES,
              items: {
                type: 'object',
                required: ['label', 'productoId'],
                additionalProperties: false,
                properties: {
                  label: { type: 'string', minLength: 1, maxLength: 24, pattern: '\\S' },
                  productoId: { type: ['string', 'null'], minLength: 1 },
                },
              },
            },
          },
        },
      },
    },
    (req) => guardarBotones(db, req.body.botones),
  );
}
