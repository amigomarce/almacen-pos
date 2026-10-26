import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ErrorDominio } from '@almacen/core';
import type { Db } from '../db/client.js';
import { backups } from '../db/schema.js';
import type { AlmacenObjetos } from './almacen.js';

export type RespaldoCloud = typeof backups.$inferSelect;

export interface NuevoRespaldo {
  id: string;
  ownerId: string;
  installationId: string;
  filename: string;
  objectKey: string;
  sizeBytes: number;
  sha256: string | null;
  createdAt: Date;
}

/** Metadatos de respaldos, desacoplados del driver para tests. */
export interface RepoRespaldos {
  guardar(datos: NuevoRespaldo): Promise<RespaldoCloud>;
  listar(ownerId: string, installationId: string, limite?: number): Promise<RespaldoCloud[]>;
  porId(ownerId: string, installationId: string, id: string): Promise<RespaldoCloud | null>;
  /** Respaldos que sobran después de conservar los `conservar` más nuevos. */
  antiguos(ownerId: string, installationId: string, conservar: number): Promise<RespaldoCloud[]>;
  eliminar(id: string): Promise<void>;
}

export function crearRepoRespaldos(db: Db): RepoRespaldos {
  return {
    async guardar(datos) {
      const fila = await db.insert(backups).values(datos).returning();
      const creada = fila[0];
      if (!creada) throw new ErrorDominio('RESPALDO_NO_GUARDADO', 'No se guardó el respaldo');
      return creada;
    },
    async listar(ownerId, installationId, limite = 50) {
      return db
        .select()
        .from(backups)
        .where(and(eq(backups.ownerId, ownerId), eq(backups.installationId, installationId)))
        .orderBy(desc(backups.createdAt))
        .limit(Math.max(1, Math.min(limite, 100)));
    },
    async porId(ownerId, installationId, id) {
      const [fila] = await db
        .select()
        .from(backups)
        .where(
          and(
            eq(backups.ownerId, ownerId),
            eq(backups.installationId, installationId),
            eq(backups.id, id),
          ),
        );
      return fila ?? null;
    },
    async antiguos(ownerId, installationId, conservar) {
      return db
        .select()
        .from(backups)
        .where(and(eq(backups.ownerId, ownerId), eq(backups.installationId, installationId)))
        .orderBy(desc(backups.createdAt))
        .offset(Math.max(0, conservar));
    },
    async eliminar(id) {
      await db.delete(backups).where(eq(backups.id, id));
    },
  };
}

export interface DatosSubida {
  ownerId: string;
  installationId: string;
  filename: string;
  sizeBytes: number;
  sha256: string | null;
  datos: Buffer;
  createdAt: Date;
  retention: number;
}

const NOMBRE = /^[A-Za-z0-9._-]{1,120}\.apos$/;

/**
 * Guarda el objeto en Storage y los metadatos en Postgres, y poda los respaldos que sobran.
 * Si el registro en Postgres falla, intenta borrar el objeto para no dejar basura.
 */
export async function guardarRespaldo(
  repo: RepoRespaldos,
  almacen: AlmacenObjetos,
  datos: DatosSubida,
): Promise<RespaldoCloud> {
  if (!NOMBRE.test(datos.filename)) {
    throw new ErrorDominio('RESPALDO_NOMBRE_INVALIDO', 'El nombre del respaldo no es válido');
  }
  if (datos.sizeBytes <= 0) {
    throw new ErrorDominio('RESPALDO_VACIO', 'El respaldo está vacío');
  }
  if (datos.retention < 1 || datos.retention > 30) {
    throw new ErrorDominio('RESPALDO_RETENCION_INVALIDA', 'La retención debe estar entre 1 y 30');
  }
  const id = uuidv7();
  const objectKey = `${datos.ownerId}/${datos.installationId}/${id}.apos`;
  await almacen.subir(objectKey, datos.datos, 'application/octet-stream');
  let fila: RespaldoCloud;
  try {
    fila = await repo.guardar({
      id,
      ownerId: datos.ownerId,
      installationId: datos.installationId,
      filename: datos.filename,
      objectKey,
      sizeBytes: datos.sizeBytes,
      sha256: datos.sha256,
      createdAt: datos.createdAt,
    });
  } catch (error) {
    await almacen.eliminar(objectKey).catch(() => undefined);
    throw error;
  }

  const sobran = await repo.antiguos(datos.ownerId, datos.installationId, datos.retention);
  for (const viejo of sobran) {
    try {
      await almacen.eliminar(viejo.objectKey);
      await repo.eliminar(viejo.id);
    } catch {
      // La poda se reintenta en la próxima subida; no invalida el respaldo recién guardado.
    }
  }
  return fila;
}

export function sha256De(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}
