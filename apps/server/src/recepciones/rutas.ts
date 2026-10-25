import { randomUUID } from 'node:crypto';
import { costoPromedio, MILI } from '@almacen/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import { products, stockMovements } from '../db/schema.js';
import { ErrorHttp } from '../errores.js';
import { movimientoAWire } from '../sincronizacion/mapping.js';
import { encolar } from '../sincronizacion/outbox.js';

export interface LineaRecepcion {
  productoId: string;
  cantidadMilli: number;
  /** Costo por unidad o por kg (opcional): actualiza el costo promedio. */
  costoUnitarioClp?: number;
}

export interface ResultadoRecepcion {
  id: string;
  lineas: {
    productoId: string;
    nombre: string;
    cantidadMilli: number;
    stockAnteriorMilli: number;
    stockNuevoMilli: number;
    costoAnteriorClp: number | null;
    costoNuevoClp: number | null;
  }[];
}

/**
 * Recepción de mercadería: suma stock (movimiento RECEPCION) y, si viene el costo, recalcula el
 * costo promedio ponderado. Todas las líneas se guardan juntas o ninguna.
 */
export function registrarRecepcion(
  db: Db,
  lineas: readonly LineaRecepcion[],
  usuarioId: string,
): ResultadoRecepcion {
  const id = randomUUID();
  const ahora = new Date();
  return db.transaction(() => {
    const resultado: ResultadoRecepcion['lineas'] = [];
    lineas.forEach((l, i) => {
      const p = db
        .select()
        .from(products)
        .where(and(eq(products.id, l.productoId), isNull(products.deletedAt)))
        .get();
      if (!p?.active) {
        throw new ErrorHttp(
          'PRODUCTO_NO_ENCONTRADO',
          `Línea ${i + 1}: el producto no existe o está desactivado`,
          400,
        );
      }
      if (p.unit === 'UN' && l.cantidadMilli % MILI !== 0) {
        throw new ErrorHttp(
          'CANTIDAD_FRACCIONARIA',
          `Línea ${i + 1}: ${p.name} se recibe por unidades enteras`,
          400,
        );
      }
      const costoNuevo =
        l.costoUnitarioClp === undefined
          ? p.costClp
          : costoPromedio(p.stockQtyMilli, p.costClp, l.cantidadMilli, l.costoUnitarioClp);
      const m = db
        .insert(stockMovements)
        .values({
          productId: p.id,
          qtyMilli: l.cantidadMilli,
          type: 'RECEPCION',
          refId: id,
          userId: usuarioId,
          at: ahora,
        })
        .returning()
        .get();
      encolar(db, {
        entity: 'stock_movements',
        entityId: m.id,
        op: 'INSERT',
        payload: movimientoAWire(m),
      });
      db.update(products)
        .set({
          stockQtyMilli: p.stockQtyMilli + l.cantidadMilli,
          costClp: costoNuevo,
          updatedAt: ahora,
        })
        .where(eq(products.id, p.id))
        .run();
      resultado.push({
        productoId: p.id,
        nombre: p.name,
        cantidadMilli: l.cantidadMilli,
        stockAnteriorMilli: p.stockQtyMilli,
        stockNuevoMilli: p.stockQtyMilli + l.cantidadMilli,
        costoAnteriorClp: p.costClp,
        costoNuevoClp: costoNuevo,
      });
    });
    return { id, lineas: resultado };
  });
}

export function registrarRecepciones(
  app: FastifyInstance,
  { db, sesiones }: { db: Db; sesiones: Sesiones },
): void {
  app.post<{ Body: { lineas: LineaRecepcion[] } }>(
    '/receptions',
    {
      onRequest: requiereSesion(sesiones),
      schema: {
        body: {
          type: 'object',
          required: ['lineas'],
          additionalProperties: false,
          properties: {
            lineas: {
              type: 'array',
              minItems: 1,
              maxItems: 300,
              items: {
                type: 'object',
                required: ['productoId', 'cantidadMilli'],
                additionalProperties: false,
                properties: {
                  productoId: { type: 'string', minLength: 1 },
                  cantidadMilli: { type: 'integer', minimum: 1, maximum: 1_000_000_000 },
                  costoUnitarioClp: { type: 'integer', minimum: 0, maximum: 100_000_000 },
                },
              },
            },
          },
        },
      },
    },
    (req, reply) => {
      const r = registrarRecepcion(db, req.body.lineas, req.sesion?.usuario.id ?? '');
      req.log.info(
        { recepcion: r.id, lineas: r.lineas.length, usuario: req.sesion?.usuario.name },
        'Recepción de mercadería',
      );
      return reply.code(201).send(r);
    },
  );
}
