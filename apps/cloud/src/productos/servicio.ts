import type { products } from '../db/schema.js';

export type ProductoCloud = typeof products.$inferSelect;

/** Campos que el dueño edita desde el móvil. El precio es el principal. */
export interface CambiosProducto {
  name?: string;
  brand?: string | null;
  format?: string | null;
  priceClp?: number;
  costClp?: number | null;
  taxType?: 'AFECTO' | 'EXENTO';
  stockMinMilli?: number | null;
  active?: boolean;
}

export interface RepoProductos {
  porId(ownerId: string, id: string): Promise<ProductoCloud | null>;
  listar(ownerId: string, buscar: string, limite: number): Promise<ProductoCloud[]>;
  /** Actualiza el producto y encola el evento hacia la caja en la misma transacción. */
  guardarCambio(ownerId: string, p: ProductoCloud): Promise<void>;
  listarPorFiltro(ownerId: string, filtro: FiltroPrecios): Promise<ProductoCloud[]>;
  /** Actualiza varios productos y encola un evento por cada uno (atómico). */
  guardarCambios(ownerId: string, productos: readonly ProductoCloud[]): Promise<void>;
}

/** Filtro para el cambio masivo de precios (al menos uno de los dos). */
export interface FiltroPrecios {
  categoriaId?: string;
  marca?: string;
}

export type ResultadoEdicion =
  { ok: true; producto: ProductoCloud } | { ok: false; error: 'NO_ENCONTRADO' | 'PRECIO_INVALIDO' };

/**
 * Edita un producto del dueño. Sube la `version` y encola el cambio para que la caja lo baje
 * (el dueño gana los conflictos, ARQUITECTURA §2).
 */
export async function editarProducto(
  repo: RepoProductos,
  args: { ownerId: string; id: string; cambios: CambiosProducto; ahora: Date },
): Promise<ResultadoEdicion> {
  const p = await repo.porId(args.ownerId, args.id);
  if (!p) return { ok: false, error: 'NO_ENCONTRADO' };
  const precio = args.cambios.priceClp;
  if (precio !== undefined && (!Number.isInteger(precio) || precio < 1)) {
    return { ok: false, error: 'PRECIO_INVALIDO' };
  }
  const actualizado: ProductoCloud = {
    ...p,
    ...args.cambios,
    version: p.version + 1,
    updatedAt: args.ahora,
  };
  await repo.guardarCambio(args.ownerId, actualizado);
  return { ok: true, producto: actualizado };
}

export interface ResultadoCambioMasivo {
  cantidad: number;
  productos: ProductoCloud[];
}

/**
 * Cambio masivo de precios por categoría y/o marca, con un porcentaje (+5 o −10). Cada
 * producto sube su `version` y se encola un evento hacia la caja (el dueño gana).
 */
export async function cambioMasivoPrecio(
  repo: RepoProductos,
  args: { ownerId: string; filtro: FiltroPrecios; porcentaje: number; ahora: Date },
): Promise<ResultadoCambioMasivo> {
  const afectados = await repo.listarPorFiltro(args.ownerId, args.filtro);
  const actualizados = afectados.map((p) => ({
    ...p,
    priceClp: Math.max(1, Math.round(p.priceClp * (1 + args.porcentaje / 100))),
    version: p.version + 1,
    updatedAt: args.ahora,
  }));
  await repo.guardarCambios(args.ownerId, actualizados);
  return { cantidad: actualizados.length, productos: actualizados };
}
