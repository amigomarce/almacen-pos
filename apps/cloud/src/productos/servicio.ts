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
