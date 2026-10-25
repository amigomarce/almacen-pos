import type { Db } from '../db/client.js';
import type { LimitadorIntentos } from './intentos.js';
import { verificarPinDueno, type UsuarioPublico } from './usuarios.js';

/** Clave del limitador para la clave del dueño (es una sola para todos los dueños). */
const CLAVE_DUENO = 'autorizacion-dueno';

export type ResultadoAutorizacion =
  | { ok: true; dueno: UsuarioPublico }
  | { ok: false; estado: 401 | 429; cuerpo: Record<string, unknown> };

/** Verifica la clave del dueño con límite de intentos (5 fallos → 1 minuto de bloqueo). */
export function autorizarDueno(
  db: Db,
  intentos: LimitadorIntentos,
  pin: string,
): ResultadoAutorizacion {
  const bloqueo = (segundos: number): ResultadoAutorizacion => ({
    ok: false,
    estado: 429,
    cuerpo: {
      error: 'BLOQUEADO',
      mensaje: `Demasiados intentos. Espera ${segundos} segundos.`,
      segundos,
    },
  });
  const estado = intentos.estado(CLAVE_DUENO);
  if (estado.bloqueado) return bloqueo(estado.segundosRestantes);
  const dueno = verificarPinDueno(db, pin);
  if (!dueno) {
    const restantes = intentos.fallo(CLAVE_DUENO);
    if (restantes === 0) {
      const e = intentos.estado(CLAVE_DUENO);
      return bloqueo(e.bloqueado ? e.segundosRestantes : 0);
    }
    return {
      ok: false,
      estado: 401,
      cuerpo: {
        error: 'PIN_INCORRECTO',
        mensaje: 'Clave del dueño incorrecta',
        intentosRestantes: restantes,
      },
    };
  }
  intentos.exito(CLAVE_DUENO);
  return { ok: true, dueno };
}
