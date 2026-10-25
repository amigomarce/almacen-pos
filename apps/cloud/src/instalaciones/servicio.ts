import type { installations } from '../db/schema.js';

export type Instalacion = typeof installations.$inferSelect;

/** Datos necesarios para crear o vincular una instalación (todo con dueño ya asignado). */
export interface NuevaInstalacion {
  id: string;
  name: string;
  tokenHash: string;
  ownerId: string;
  linkedAt: Date;
}

/** Acceso a `installations` desacoplado del driver (tests usan un repositorio en memoria). */
export interface RepoInstalaciones {
  porId(id: string): Promise<Instalacion | null>;
  porTokenHash(hash: string): Promise<Instalacion | null>;
  crear(datos: NuevaInstalacion): Promise<Instalacion>;
  marcarVinculada(datos: NuevaInstalacion): Promise<Instalacion>;
}

export type ResultadoVinculacion =
  { ok: true; instalacion: Instalacion; creada: boolean } | { ok: false; error: 'YA_VINCULADA' };

/**
 * Vincula una caja a la cuenta del dueño. Es idempotente para el mismo dueño y rechaza que
 * una caja ya vinculada cambie de dueño (habría que desvincularla primero, fuera de alcance).
 */
export async function vincularInstalacion(
  repo: RepoInstalaciones,
  datos: NuevaInstalacion,
): Promise<ResultadoVinculacion> {
  const existente = await repo.porId(datos.id);
  if (existente?.ownerId && existente.ownerId !== datos.ownerId) {
    return { ok: false, error: 'YA_VINCULADA' };
  }
  const instalacion = existente ? await repo.marcarVinculada(datos) : await repo.crear(datos);
  return { ok: true, instalacion, creada: !existente };
}
