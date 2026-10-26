import { ErrorDominio } from '@almacen/core';
import {
  parsearCaf,
  type BoletaParaGuardarSii,
  type BoletaPendienteSii,
  type EstadoSii,
  type FolioReservado,
  type RepositorioSii,
  type TipoDte,
} from '@almacen/dte';
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cafRanges, taxDocuments } from '../db/schema.js';
import { descifrar } from './cifrado.js';

export interface OpcionesRepositorioSii {
  /** Reloj inyectable para tests. */
  ahora?: () => Date;
}

/**
 * Adaptador SQLite del puerto `RepositorioSii`.
 *
 * - Los folios viven en `caf_ranges.next_folio`; reservar es una transacción (una sola caja
 *   escribe, pero así el folio tampoco se pierde si el proceso se cae a mitad).
 * - La cola de envío son las filas de `tax_documents` en estado `PENDIENTE` con su XML.
 * - Un folio reservado no se devuelve nunca: si la generación falla, se salta uno.
 */
export function crearRepositorioSii(
  db: Db,
  clave: Buffer,
  opciones: OpcionesRepositorioSii = {},
): RepositorioSii {
  const ahora = opciones.ahora ?? (() => new Date());

  return {
    reservarFolio(tipoDte: TipoDte): Promise<FolioReservado> {
      try {
        return Promise.resolve(
          db.transaction(() => {
            const momento = ahora();
            const fila = db
              .select()
              .from(cafRanges)
              .where(
                and(
                  eq(cafRanges.dteType, tipoDte),
                  lte(cafRanges.nextFolio, cafRanges.folioTo),
                  or(isNull(cafRanges.expiresAt), gte(cafRanges.expiresAt, momento)),
                ),
              )
              .orderBy(asc(cafRanges.folioFrom))
              .get();
            if (!fila) {
              throw new ErrorDominio(
                'CAF_AGOTADO',
                `No hay folios disponibles para DTE ${tipoDte}. Carga un CAF nuevo.`,
              );
            }

            const caf = parsearCaf(descifrar(fila.xmlEncrypted, clave));
            if (caf.tipoDte !== tipoDte) {
              throw new ErrorDominio(
                'CAF_INVALIDO',
                `El CAF guardado es de tipo ${caf.tipoDte}, no ${tipoDte}`,
              );
            }
            const folio = fila.nextFolio;
            db.update(cafRanges)
              .set({ nextFolio: folio + 1 })
              .where(eq(cafRanges.id, fila.id))
              .run();
            return { caf, folio };
          }),
        );
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },

    guardarPendiente(boleta: BoletaParaGuardarSii): Promise<void> {
      const { venta, documento } = boleta;
      db.insert(taxDocuments)
        .values({
          saleId: venta.ventaId,
          provider: 'SII_DIRECTO',
          dteType: documento.tipoDte,
          folio: documento.folio,
          entrega: venta.entrega,
          totalClp: venta.totales.totalClp,
          netoClp: venta.totales.netoClp,
          ivaClp: venta.totales.ivaClp,
          exentoClp: venta.totales.exentoClp,
          xml: documento.xml,
          ted: documento.ted,
          siiStatus: 'PENDIENTE',
          attempts: 0,
          createdAt: ahora(),
        })
        .run();
      return Promise.resolve();
    },

    pendientes(): Promise<readonly BoletaPendienteSii[]> {
      return Promise.resolve(
        db
          .select({
            id: taxDocuments.id,
            tipoDte: taxDocuments.dteType,
            folio: taxDocuments.folio,
            xml: taxDocuments.xml,
            intentos: taxDocuments.attempts,
            ultimoIntento: taxDocuments.lastAttemptAt,
          })
          .from(taxDocuments)
          .where(
            and(eq(taxDocuments.provider, 'SII_DIRECTO'), eq(taxDocuments.siiStatus, 'PENDIENTE')),
          )
          .orderBy(asc(taxDocuments.createdAt), asc(taxDocuments.id))
          .all()
          .flatMap((fila) =>
            fila.tipoDte !== null && fila.folio !== null && fila.xml !== null
              ? [
                  {
                    id: fila.id,
                    tipoDte: fila.tipoDte as TipoDte,
                    folio: fila.folio,
                    xml: fila.xml,
                    intentos: fila.intentos,
                    ultimoIntento: fila.ultimoIntento,
                  },
                ]
              : [],
          ),
      );
    },

    marcarEnviada(
      id: string,
      datos: { trackId: string; estado: EstadoSii; ahora: Date },
    ): Promise<void> {
      db.update(taxDocuments)
        .set({
          siiStatus: datos.estado,
          trackId: datos.trackId,
          sentAt: datos.ahora,
          lastAttemptAt: datos.ahora,
          lastError: null,
        })
        .where(eq(taxDocuments.id, id))
        .run();
      return Promise.resolve();
    },

    marcarError(id: string, datos: { error: string; ahora: Date }): Promise<void> {
      db.update(taxDocuments)
        .set({
          attempts: sql`${taxDocuments.attempts} + 1`,
          lastError: datos.error.slice(0, 500),
          lastAttemptAt: datos.ahora,
        })
        .where(eq(taxDocuments.id, id))
        .run();
      return Promise.resolve();
    },

    actualizarEstado(trackId: string, estado: EstadoSii): Promise<void> {
      db.update(taxDocuments)
        .set({ siiStatus: estado })
        .where(eq(taxDocuments.trackId, trackId))
        .run();
      return Promise.resolve();
    },
  };
}
