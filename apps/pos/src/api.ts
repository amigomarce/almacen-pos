/**
 * Cliente HTTP del servidor local de la caja (apps/server). En desarrollo Vite redirige
 * `/api/...` a 127.0.0.1:3001 (vite.config.ts).
 */

export class ErrorApi extends Error {
  constructor(
    /** Código HTTP; 0 si no hubo respuesta (servidor apagado o sin red). */
    readonly estado: number,
    /** Código de error del servidor (ej. `PIN_INCORRECTO`), si lo envió. */
    readonly codigo: string | null,
    mensaje: string,
    /** Resto del cuerpo de error (ej. `intentosRestantes`, `segundos`). */
    readonly datos: Record<string, unknown> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export const MENSAJE_SIN_CONEXION = 'No hay conexión con el servidor de la caja';

export type Rol = 'DUENO' | 'CAJERO';

export interface EstadoServidor {
  status: 'ok' | 'degradado';
  version: string;
  db: 'ok' | 'error';
  semilla: boolean;
  hora: string;
  /** Modalidad de boleta (`MOCK`, `PUENTE_MANUAL`, ...). */
  modalidadBoleta: string | null;
  /** `true` con MOCK: hay que mostrar "MODO PRUEBA – no emite boletas". */
  modoPrueba: boolean;
}

export interface Usuario {
  id: string;
  name: string;
  role: Rol;
}

export interface Caja {
  id: string;
  name: string;
}

export interface SesionCaja {
  id: string;
  abiertaPor: { id: string; name: string };
  abiertaEn: string;
  efectivoInicialClp: number;
}

export interface EstadoCaja {
  caja: Caja;
  sesion: SesionCaja | null;
}

type Fetch = typeof fetch;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export class ClienteApi {
  private token: string | null = null;
  private readonly oyentesSinSesion = new Set<() => void>();

  constructor(
    private readonly base: string = '/api',
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
  ) {}

  /** Avisa cuando el servidor dice que la sesión ya no vale. Devuelve cómo dejar de escuchar. */
  alPerderSesion(oyente: () => void): () => void {
    this.oyentesSinSesion.add(oyente);
    return () => {
      this.oyentesSinSesion.delete(oyente);
    };
  }

  usarToken(token: string | null): void {
    this.token = token;
  }

  async pedir<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers['authorization'] = `Bearer ${this.token}`;
    const init: RequestInit = { method: opciones.metodo ?? 'GET', headers };
    if (opciones.cuerpo !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opciones.cuerpo);
    }
    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(`${this.base}${ruta}`, init);
    } catch {
      throw new ErrorApi(0, 'SIN_CONEXION', MENSAJE_SIN_CONEXION);
    }
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const datos = esObjeto(cuerpo) ? cuerpo : {};
      const codigo = typeof datos['error'] === 'string' ? datos['error'] : null;
      const mensaje =
        typeof datos['mensaje'] === 'string'
          ? datos['mensaje']
          : `El servidor respondió con error ${respuesta.status}`;
      if (codigo === 'SIN_SESION') for (const o of this.oyentesSinSesion) o();
      throw new ErrorApi(respuesta.status, codigo, mensaje, datos);
    }
    return cuerpo as T;
  }

  estado(): Promise<EstadoServidor> {
    return this.pedir<EstadoServidor>('/health');
  }

  usuarios(): Promise<Usuario[]> {
    return this.pedir<Usuario[]>('/auth/usuarios');
  }

  entrar(usuarioId: string, pin: string): Promise<{ token: string; usuario: Usuario }> {
    return this.pedir('/auth/login', { metodo: 'POST', cuerpo: { usuarioId, pin } });
  }

  sesion(): Promise<{ usuario: Usuario }> {
    return this.pedir('/auth/sesion');
  }

  async salir(): Promise<void> {
    await this.pedir('/auth/logout', { metodo: 'POST' });
  }

  estadoCaja(): Promise<EstadoCaja> {
    return this.pedir<EstadoCaja>('/cash/current');
  }

  abrirCaja(efectivoInicialClp: number): Promise<EstadoCaja> {
    return this.pedir<EstadoCaja>('/cash/open', { metodo: 'POST', cuerpo: { efectivoInicialClp } });
  }
}

export const api = new ClienteApi();
