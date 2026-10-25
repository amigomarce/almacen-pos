/** Tras 5 PIN incorrectos seguidos, se bloquea ese usuario por 1 minuto. */
export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 60 * 1000;

interface Registro {
  fallos: number;
  bloqueadoHasta: number;
}

export type EstadoIntento = { bloqueado: false } | { bloqueado: true; segundosRestantes: number };

/**
 * Limita los intentos de PIN por clave (usuario o "dueño"). Un PIN de 4 dígitos tiene solo
 * 10.000 combinaciones: sin esto se adivina en minutos.
 */
export class LimitadorIntentos {
  private readonly registros = new Map<string, Registro>();

  constructor(
    private readonly reloj: () => number = Date.now,
    private readonly maxIntentos = MAX_INTENTOS,
    private readonly bloqueoMs = BLOQUEO_MS,
  ) {}

  estado(clave: string): EstadoIntento {
    const r = this.registros.get(clave);
    const ahora = this.reloj();
    if (!r || r.bloqueadoHasta <= ahora) return { bloqueado: false };
    return { bloqueado: true, segundosRestantes: Math.ceil((r.bloqueadoHasta - ahora) / 1000) };
  }

  /** Registra un fallo. Devuelve cuántos intentos quedan antes del bloqueo (0 = bloqueado). */
  fallo(clave: string): number {
    const ahora = this.reloj();
    const previo = this.registros.get(clave);
    // Al terminar un bloqueo se parte de cero.
    const r =
      previo && previo.bloqueadoHasta <= ahora && previo.fallos >= this.maxIntentos
        ? { fallos: 0, bloqueadoHasta: 0 }
        : (previo ?? { fallos: 0, bloqueadoHasta: 0 });
    r.fallos += 1;
    if (r.fallos >= this.maxIntentos) r.bloqueadoHasta = ahora + this.bloqueoMs;
    this.registros.set(clave, r);
    return Math.max(0, this.maxIntentos - r.fallos);
  }

  exito(clave: string): void {
    this.registros.delete(clave);
  }
}
