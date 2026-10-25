import { SignJWT } from 'jose';
import type {
  Instalacion,
  NuevaInstalacion,
  RepoInstalaciones,
} from '../instalaciones/servicio.js';
import type { categories, products, saleItems, sales, stockMovements } from '../db/schema.js';
import type { EventoSaliente, RepoSyncNube } from '../sincronizacion/servicio.js';

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

export interface RepoSyncFalso extends RepoSyncNube {
  productos: (typeof products.$inferInsert)[];
  categorias: (typeof categories.$inferInsert)[];
  borradosProducto: string[];
  borradosCategoria: string[];
  ventas: (typeof sales.$inferInsert)[];
  ventasActualizadas: (typeof sales.$inferInsert)[];
  lineas: (typeof saleItems.$inferInsert)[];
  movimientos: (typeof stockMovements.$inferInsert)[];
  pendientes: EventoSaliente[];
  sincronizados: string[];
}

/** Repositorio de sincronización en memoria: registra lo que se ingesta. */
export function repoSyncFalso(pendientes: EventoSaliente[] = []): RepoSyncFalso {
  const f: RepoSyncFalso = {
    productos: [],
    categorias: [],
    borradosProducto: [],
    borradosCategoria: [],
    ventas: [],
    ventasActualizadas: [],
    lineas: [],
    movimientos: [],
    pendientes: [...pendientes],
    sincronizados: [],
    upsertProducto(p) {
      f.productos.push(p);
      return Promise.resolve();
    },
    upsertCategoria(c) {
      f.categorias.push(c);
      return Promise.resolve();
    },
    borrarProducto(id) {
      f.borradosProducto.push(id);
      return Promise.resolve();
    },
    borrarCategoria(id) {
      f.borradosCategoria.push(id);
      return Promise.resolve();
    },
    insertarVenta(v) {
      f.ventas.push(v);
      return Promise.resolve();
    },
    actualizarVenta(v) {
      f.ventasActualizadas.push(v);
      return Promise.resolve();
    },
    insertarLinea(l) {
      f.lineas.push(l);
      return Promise.resolve();
    },
    insertarMovimiento(m) {
      f.movimientos.push(m);
      return Promise.resolve();
    },
    eventosPendientes() {
      return Promise.resolve([...f.pendientes]);
    },
    marcarSincronizados(_ownerId, ids) {
      f.sincronizados.push(...ids);
      return Promise.resolve();
    },
  };
  return f;
}
