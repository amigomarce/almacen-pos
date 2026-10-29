import { SignJWT } from 'jose';
import type {
  Instalacion,
  NuevaInstalacion,
  RepoInstalaciones,
} from '../instalaciones/servicio.js';
import type {
  categories,
  cashCloses,
  products,
  customerLedger,
  customers,
  saleItems,
  saleReturns,
  sales,
  stockMovements,
} from '../db/schema.js';
import type { EventoSaliente, RepoSyncNube } from '../sincronizacion/servicio.js';
import type { FiltroPrecios, ProductoCloud, RepoProductos } from '../productos/servicio.js';
import type { RepoRecepciones } from '../recepciones/servicio.js';

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
  cierres: (typeof cashCloses.$inferInsert)[];
  devoluciones: (typeof saleReturns.$inferInsert)[];
  clientes: (typeof customers.$inferInsert)[];
  movimientosFiado: (typeof customerLedger.$inferInsert)[];
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
    cierres: [],
    devoluciones: [],
    clientes: [],
    movimientosFiado: [],
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
    upsertCierre(c) {
      f.cierres.push(c);
      return Promise.resolve();
    },
    insertarDevolucion(d) {
      f.devoluciones.push(d);
      return Promise.resolve();
    },
    upsertCliente(c) {
      f.clientes.push(c);
      return Promise.resolve();
    },
    insertarMovimientoFiado(m) {
      f.movimientosFiado.push(m);
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

export function productoCloud(parcial: Partial<ProductoCloud> & { id: string }): ProductoCloud {
  return {
    ownerId: 'dueno-1',
    barcode: null,
    name: 'Producto',
    brand: null,
    format: null,
    unit: 'UN',
    categoryId: null,
    priceClp: 1000,
    costClp: null,
    taxType: 'AFECTO',
    extraTaxCode: null,
    stockMinMilli: null,
    active: true,
    source: 'LOCAL',
    seedRef: null,
    scaleCode: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    version: 1,
    deletedAt: null,
    ...parcial,
  };
}

export interface RepoProductosFalso extends RepoProductos {
  filas: ProductoCloud[];
  /** Eventos encolados en `guardarCambio` (entidad, id, op, payload). */
  encolados: { entity: string; entityId: string; op: string; payload: unknown }[];
}

/** Repositorio de productos del dueño en memoria para tests. */
export function repoProductosFalso(iniciales: ProductoCloud[] = []): RepoProductosFalso {
  const filas = [...iniciales];
  const encolados: RepoProductosFalso['encolados'] = [];
  return {
    filas,
    encolados,
    porId(ownerId, id) {
      return Promise.resolve(filas.find((f) => f.id === id && f.ownerId === ownerId) ?? null);
    },
    listar(ownerId, buscar, limite) {
      const coinciden = filas.filter(
        (f) =>
          f.ownerId === ownerId &&
          (!buscar || f.name.includes(buscar) || (f.brand?.includes(buscar) ?? false)),
      );
      return Promise.resolve(coinciden.slice(0, limite));
    },
    guardarCambio(ownerId, p) {
      const idx = filas.findIndex((f) => f.id === p.id && f.ownerId === ownerId);
      if (idx >= 0) filas[idx] = p;
      encolados.push({
        entity: 'products',
        entityId: p.id,
        op: 'UPDATE',
        payload: { id: p.id, priceClp: p.priceClp, version: p.version },
      });
      return Promise.resolve();
    },
    listarPorFiltro(ownerId, filtro: FiltroPrecios) {
      const coinciden = filas.filter(
        (f) =>
          f.ownerId === ownerId &&
          (!filtro.categoriaId || f.categoryId === filtro.categoriaId) &&
          (!filtro.marca || f.brand === filtro.marca),
      );
      return Promise.resolve(coinciden);
    },
    guardarCambios(ownerId, productos) {
      for (const p of productos) {
        const idx = filas.findIndex((f) => f.id === p.id && f.ownerId === ownerId);
        if (idx >= 0) filas[idx] = p;
        encolados.push({
          entity: 'products',
          entityId: p.id,
          op: 'UPDATE',
          payload: { id: p.id, priceClp: p.priceClp, version: p.version },
        });
      }
      return Promise.resolve();
    },
  };
}

export interface RepoRecepcionesFalso extends RepoRecepciones {
  guardados: {
    producto?: ProductoCloud;
    movimiento: Omit<typeof stockMovements.$inferInsert, 'ownerId'>;
  }[];
}

/** Repositorio de recepciones en memoria: registra lo que se guardó. */
export function repoRecepcionesFalso(
  productos: ProductoCloud[] = [],
  stock: Record<string, number> = {},
): RepoRecepcionesFalso {
  const guardados: RepoRecepcionesFalso['guardados'] = [];
  return {
    guardados,
    porId(ownerId, id) {
      return Promise.resolve(productos.find((p) => p.id === id && p.ownerId === ownerId) ?? null);
    },
    stockDe(_ownerId, productId) {
      return Promise.resolve(stock[productId] ?? 0);
    },
    guardar(_ownerId, datos) {
      guardados.push(datos);
      return Promise.resolve();
    },
  };
}
