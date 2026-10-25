import { SignJWT } from 'jose';
import type {
  Instalacion,
  NuevaInstalacion,
  RepoInstalaciones,
} from '../instalaciones/servicio.js';

export const SECRETO_JWT = 'secreto-de-prueba-suficientemente-largo-para-hs256';

/** Firma un JWT HS256 como los de Supabase Auth (`sub` = id del dueño). */
export async function firmarJwt(sub: string, secreto: string = SECRETO_JWT): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .sign(new TextEncoder().encode(secreto));
}

export function instalacion(parcial: Partial<Instalacion> & { id: string }): Instalacion {
  return {
    name: 'Caja 1',
    tokenHash: 'hash',
    ownerId: null,
    linkedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...parcial,
  };
}

export interface RepoFalso extends RepoInstalaciones {
  filas: Instalacion[];
}

/** Repositorio de instalaciones en memoria para tests. */
export function repoFalso(iniciales: Instalacion[] = []): RepoFalso {
  const filas = [...iniciales];
  return {
    filas,
    async porId(id) {
      return Promise.resolve(filas.find((f) => f.id === id) ?? null);
    },
    async porTokenHash(hash) {
      return Promise.resolve(filas.find((f) => f.tokenHash === hash) ?? null);
    },
    async crear(d: NuevaInstalacion) {
      const f = instalacion({ ...d, createdAt: new Date(), updatedAt: new Date() });
      filas.push(f);
      return Promise.resolve(f);
    },
    async marcarVinculada(d: NuevaInstalacion) {
      const idx = filas.findIndex((f) => f.id === d.id);
      if (idx < 0) throw new Error('instalación no encontrada');
      const f = instalacion({ ...filas[idx], ...d, updatedAt: new Date() });
      filas[idx] = f;
      return Promise.resolve(f);
    },
  };
}
