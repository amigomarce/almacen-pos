import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { installations } from '../db/schema.js';
import type { NuevaInstalacion, RepoInstalaciones } from './servicio.js';

/** Repositorio real de instalaciones sobre PostgreSQL (Drizzle). */
export function crearRepoInstalaciones(db: Db): RepoInstalaciones {
  return {
    async porId(id) {
      const [fila] = await db.select().from(installations).where(eq(installations.id, id));
      return fila ?? null;
    },
    async porTokenHash(hash) {
      const [fila] = await db.select().from(installations).where(eq(installations.tokenHash, hash));
      return fila ?? null;
    },
    async crear(datos) {
      const [fila] = await db
        .insert(installations)
        .values({ ...datos })
        .returning();
      if (!fila) throw new Error('no se pudo crear la instalación');
      return fila;
    },
    async marcarVinculada(datos: NuevaInstalacion) {
      const [fila] = await db
        .update(installations)
        .set({
          name: datos.name,
          tokenHash: datos.tokenHash,
          ownerId: datos.ownerId,
          linkedAt: datos.linkedAt,
        })
        .where(eq(installations.id, datos.id))
        .returning();
      if (!fila) throw new Error('no se pudo vincular la instalación');
      return fila;
    },
  };
}
