import { randomBytes } from 'node:crypto';
import type { Rol } from '../db/schema.js';

export interface UsuarioSesion {
  id: string;
  name: string;
  role: Rol;
}

export interface Sesion {
  token: string;
  usuario: UsuarioSesion;
  creadaEn: number;
  ultimoUso: number;
}

/** Una sesión sin uso por 12 horas vence (un turno largo de almacén cabe de sobra). */
export const INACTIVIDAD_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * Sesiones de la caja, en memoria. Si el servidor se reinicia, todos vuelven a poner su PIN:
 * es aceptable y evita guardar tokens en disco.
 */
export class Sesiones {
  private readonly porToken = new Map<string, Sesion>();

  constructor(
    private readonly reloj: () => number = Date.now,
    private readonly inactividadMaxMs = INACTIVIDAD_MAX_MS,
  ) {}

  crear(usuario: UsuarioSesion): Sesion {
    const ahora = this.reloj();
    const sesion: Sesion = {
      token: randomBytes(32).toString('base64url'),
      usuario: { ...usuario },
      creadaEn: ahora,
      ultimoUso: ahora,
    };
    this.porToken.set(sesion.token, sesion);
    return sesion;
  }

  /** Devuelve la sesión vigente y renueva su último uso; `null` si no existe o venció. */
  obtener(token: string): Sesion | null {
    const sesion = this.porToken.get(token);
    if (!sesion) return null;
    const ahora = this.reloj();
    if (ahora - sesion.ultimoUso > this.inactividadMaxMs) {
      this.porToken.delete(token);
      return null;
    }
    sesion.ultimoUso = ahora;
    return sesion;
  }

  cerrar(token: string): void {
    this.porToken.delete(token);
  }

  /** Cierra todas las sesiones de un usuario (al desactivarlo o cambiarle el rol o PIN). */
  cerrarDeUsuario(usuarioId: string): void {
    for (const [token, s] of this.porToken) {
      if (s.usuario.id === usuarioId) this.porToken.delete(token);
    }
  }
}
