import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { taxDocuments } from '../db/schema.js';

/** Minutos tras los cuales una boleta pendiente se considera atrasada (Res. 74/2020: < 1 h). */
export const MINUTOS_ALERTA_SII = 45;

export interface EstadoColaSii {
  /** Boletas emitidas y todavía no enviadas al SII. */
  pendientes: number;
  /** Antigüedad de la más antigua, en minutos (`null` si no hay pendientes). */
  masAntiguaMin: number | null;
  /** Pendientes que ya superaron el plazo de alerta. */
  atrasadas: number;
}

/**
 * Resumen de la cola offline para `/health` y la pantalla del dueño. No expone XML ni
 * secretos: solo cuántas boletas esperan y hace cuánto.
 */
export function estadoColaSii(db: Db, ahora = new Date()): EstadoColaSii {
  const filas = db
    .select({ createdAt: taxDocuments.createdAt })
    .from(taxDocuments)
    .where(and(eq(taxDocuments.provider, 'SII_DIRECTO'), eq(taxDocuments.siiStatus, 'PENDIENTE')))
    .all();
  if (filas.length === 0) {
    return { pendientes: 0, masAntiguaMin: null, atrasadas: 0 };
  }

  const limite = ahora.getTime() - MINUTOS_ALERTA_SII * 60_000;
  const masAntigua = Math.min(...filas.map((f) => f.createdAt.getTime()));
  return {
    pendientes: filas.length,
    masAntiguaMin: Math.max(0, Math.floor((ahora.getTime() - masAntigua) / 60_000)),
    atrasadas: filas.filter((f) => f.createdAt.getTime() <= limite).length,
  };
}
