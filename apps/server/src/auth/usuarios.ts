import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users, type Rol } from '../db/schema.js';
import { hashearPin, verificarPin } from './pin.js';

export interface UsuarioPublico {
  id: string;
  name: string;
  role: Rol;
  active: boolean;
}

const publico = (u: typeof users.$inferSelect): UsuarioPublico => ({
  id: u.id,
  name: u.name,
  role: u.role,
  active: u.active,
});

/** Todos los usuarios no eliminados (activos e inactivos), para la gestión del dueño. */
export function listarUsuarios(db: Db): UsuarioPublico[] {
  return db
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(users.name)
    .all()
    .map(publico);
}

/** Usuarios que pueden entrar a la caja (pantalla de PIN). */
export function listarUsuariosActivos(db: Db): UsuarioPublico[] {
  return listarUsuarios(db).filter((u) => u.active);
}

function buscarFila(db: Db, id: string): typeof users.$inferSelect | undefined {
  return db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .get();
}

export function buscarUsuario(db: Db, id: string): UsuarioPublico | null {
  const fila = buscarFila(db, id);
  return fila ? publico(fila) : null;
}

/** Devuelve el usuario si existe, está activo y el PIN es correcto. */
export function autenticar(db: Db, id: string, pin: string): UsuarioPublico | null {
  const fila = buscarFila(db, id);
  if (!fila?.active) return null;
  return verificarPin(pin, fila.pinHash) ? publico(fila) : null;
}

/** Para acciones que requieren la clave del dueño (ej. anular una venta). */
export function verificarPinDueno(db: Db, pin: string): UsuarioPublico | null {
  const duenos = db
    .select()
    .from(users)
    .where(and(eq(users.role, 'DUENO'), eq(users.active, true), isNull(users.deletedAt)))
    .all();
  const dueno = duenos.find((d) => verificarPin(pin, d.pinHash));
  return dueno ? publico(dueno) : null;
}

export function contarDuenosActivos(db: Db): number {
  return listarUsuariosActivos(db).filter((u) => u.role === 'DUENO').length;
}

export function crearUsuario(
  db: Db,
  datos: { name: string; role: Rol; pin: string },
): UsuarioPublico {
  const fila = db
    .insert(users)
    .values({ name: datos.name.trim(), role: datos.role, pinHash: hashearPin(datos.pin) })
    .returning()
    .get();
  return publico(fila);
}

export interface CambiosUsuario {
  name?: string;
  role?: Rol;
  pin?: string;
  active?: boolean;
}

export type ResultadoEdicion =
  { ok: true; usuario: UsuarioPublico } | { ok: false; error: 'NO_ENCONTRADO' | 'ULTIMO_DUENO' };

/**
 * Edita un usuario. Nunca deja el local sin un dueño activo (nadie podría cambiar precios
 * ni usuarios). Nada se borra: para sacar a alguien se desactiva.
 */
export function editarUsuario(db: Db, id: string, cambios: CambiosUsuario): ResultadoEdicion {
  // better-sqlite3 es síncrono: dentro de la transacción se puede seguir usando `db`.
  return db.transaction(() => {
    const actual = buscarFila(db, id);
    if (!actual) return { ok: false, error: 'NO_ENCONTRADO' };

    const dejaDeSerDuenoActivo =
      actual.role === 'DUENO' &&
      actual.active &&
      ((cambios.role !== undefined && cambios.role !== 'DUENO') || cambios.active === false);
    if (dejaDeSerDuenoActivo && contarDuenosActivos(db) <= 1) {
      return { ok: false, error: 'ULTIMO_DUENO' };
    }

    const fila = db
      .update(users)
      .set({
        ...(cambios.name !== undefined ? { name: cambios.name.trim() } : {}),
        ...(cambios.role !== undefined ? { role: cambios.role } : {}),
        ...(cambios.pin !== undefined ? { pinHash: hashearPin(cambios.pin) } : {}),
        ...(cambios.active !== undefined ? { active: cambios.active } : {}),
        updatedAt: new Date(),
        version: actual.version + 1,
      })
      .where(eq(users.id, id))
      .returning()
      .get();
    return { ok: true, usuario: publico(fila) };
  });
}
