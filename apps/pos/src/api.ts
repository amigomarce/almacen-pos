/**
 * Cliente HTTP del servidor local de la caja (apps/server). En desarrollo Vite redirige
 * `/api/...` a 127.0.0.1:3001 (vite.config.ts).
 */

export class ErrorApi extends Error {
  constructor(
    /** Código HTTP; 0 si no hubo respuesta (servidor apagado o sin red). */
    readonly estado: number,
    /** Código de error del servidor (ej. `CODIGO_INVALIDO`), si lo envió. */
    readonly codigo: string | null,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export const MENSAJE_SIN_CONEXION = 'No hay conexión con el servidor de la caja';

export interface EstadoServidor {
  status: 'ok' | 'degradado';
  version: string;
  db: 'ok' | 'error';
  semilla: boolean;
  hora: string;
}

type Fetch = typeof fetch;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export class ClienteApi {
  constructor(
    private readonly base: string = '/api',
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
  ) {}

  async pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(`${this.base}${ruta}`, init);
    } catch {
      throw new ErrorApi(0, 'SIN_CONEXION', MENSAJE_SIN_CONEXION);
    }
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const codigo =
        esObjeto(cuerpo) && typeof cuerpo['error'] === 'string' ? cuerpo['error'] : null;
      const mensaje =
        esObjeto(cuerpo) && typeof cuerpo['mensaje'] === 'string'
          ? cuerpo['mensaje']
          : `El servidor respondió con error ${respuesta.status}`;
      throw new ErrorApi(respuesta.status, codigo, mensaje);
    }
    return cuerpo as T;
  }

  estado(): Promise<EstadoServidor> {
    return this.pedir<EstadoServidor>('/health');
  }
}

export const api = new ClienteApi();
