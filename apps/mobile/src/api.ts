/**
 * Cliente HTTP de la nube (`apps/cloud`) para la app del dueño. Se autentica con el JWT de
 * Supabase; todos los montos vienen en pesos CLP enteros.
 */

export class ErrorApi extends Error {
  constructor(
    /** Código HTTP; 0 si no hubo respuesta (nube apagada o sin red). */
    readonly estado: number,
    /** Código de error de la nube (ej. `NO_ENCONTRADO`), si lo envió. */
    readonly codigo: string | null,
    mensaje: string,
    /** Resto del cuerpo de error. */
    readonly datos: Record<string, unknown> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export const MENSAJE_SIN_CONEXION = 'No hay conexión con la nube';

export interface Producto {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  format: string | null;
  unit: 'UN' | 'KG';
  categoryId: string | null;
  priceClp: number;
  costClp: number | null;
  taxType: 'AFECTO' | 'EXENTO';
  stockMinMilli: number | null;
  active: boolean;
}

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

export interface FiltroPrecios {
  categoriaId?: string;
  marca?: string;
}

export interface ResumenVentas {
  /** Ventas netas (menos devoluciones). */
  totalClp: number;
  cantidad: number;
  porMedio: Record<string, number>;
  devolucionesClp?: number;
}

/** Fiado (ADR-022): quién debe y cuánto. */
export interface ReporteFiado {
  totalClp: number;
  deudores: {
    id: string;
    nombre: string;
    telefono: string | null;
    saldoClp: number;
    limiteClp: number | null;
    sobreLimite: boolean;
    ultimoAbono: string | null;
    ultimoMovimiento: string | null;
  }[];
}

/** Período del reporte: hoy, 7 o 30 días (días de Chile). */
export type DiasReporte = 1 | 7 | 30;

export interface ReporteDueno {
  desde: string;
  dias: number;
  ventas: ResumenVentas;
  ticketPromedioClp: number;
  masVendidos: {
    productoId: string | null;
    nombre: string;
    unidad: string;
    cantidadMilli: number;
    montoClp: number;
    margenClp: number | null;
  }[];
  margen: {
    ventasClp: number;
    costoClp: number;
    margenClp: number;
    porcentaje: number | null;
    sinCostoClp: number;
  };
  porHora: { hora: number; montoClp: number; cantidad: number }[];
  porDia: { fecha: string; montoClp: number; cantidad: number }[];
  sugeridoCompra: {
    id: string;
    nombre: string;
    unidad: string;
    stockMilli: number;
    ventaDiariaMilli: number;
    diasDeStock: number;
    sugeridoMilli: number;
  }[];
}

export interface ProductoStockBajo {
  id: string;
  name: string;
  unit: string;
  stockQtyMilli: number;
  stockMinMilli: number | null;
}

export interface CierreCaja {
  id: string;
  registerId: string;
  registerName: string | null;
  closedAt: string;
  countedCashClp: number;
  expectedCashClp: number;
  differenceClp: number;
  totalVentasClp: number;
  cantidadVentas: number;
}

export interface LineaRecepcion {
  productId: string;
  cantidadMilli: number;
  costoUnitarioClp?: number;
}

export interface LineaRecibida {
  productId: string;
  nombre: string;
  stockAnteriorMilli: number;
  stockNuevoMilli: number;
  costoNuevoClp: number | null;
}

export interface ResultadoRecepcion {
  recepcionId: string;
  lineas: LineaRecibida[];
}

type Fetch = typeof fetch;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * La nube gratis de Render se duerme tras 15 minutos sin uso y tarda cerca de un minuto en
 * despertar (ADR-023). Mientras tanto la conexión falla o el proxy responde 502/503/504: se
 * reintenta hasta este plazo.
 */
export const ESPERA_DESPERTAR_MS = 90_000;
const PAUSA_REINTENTO_MS = 3_000;
const ESTADOS_DESPERTANDO = new Set([502, 503, 504]);

export class ClienteApi {
  private token: string | null = null;
  private esperando = 0;
  private readonly oyentesDespertar = new Set<(despertando: boolean) => void>();

  constructor(
    private readonly base: string,
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
    private readonly pausa: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Avisa cuando la app está esperando que la nube despierte (para mostrarlo en pantalla). */
  alDespertar(oyente: (despertando: boolean) => void): () => void {
    this.oyentesDespertar.add(oyente);
    return () => {
      this.oyentesDespertar.delete(oyente);
    };
  }

  private marcarEspera(delta: 1 | -1): void {
    const antes = this.esperando > 0;
    this.esperando += delta;
    const ahora = this.esperando > 0;
    if (antes !== ahora) for (const o of this.oyentesDespertar) o(ahora);
  }

  /**
   * Un intento con reintentos mientras la nube despierta. Sin respuesta solo se reintenta un
   * GET (un POST podría haber llegado); un 502/503/504 del proxy nunca llegó a la nube, así que
   * se reintenta cualquier método.
   */
  private async enviar(url: string, init: RequestInit): Promise<Response> {
    const limite = this.ahora() + ESPERA_DESPERTAR_MS;
    const sePuedeRepetir = (init.method ?? 'GET') === 'GET';
    let esperando = false;
    try {
      for (;;) {
        let respuesta: Response | null = null;
        try {
          respuesta = await this.fetchFn(url, init);
        } catch {
          if (!sePuedeRepetir || this.ahora() >= limite) {
            throw new ErrorApi(0, 'SIN_CONEXION', MENSAJE_SIN_CONEXION);
          }
        }
        if (respuesta && (!ESTADOS_DESPERTANDO.has(respuesta.status) || this.ahora() >= limite)) {
          return respuesta;
        }
        if (!esperando) {
          esperando = true;
          this.marcarEspera(1);
        }
        await this.pausa(PAUSA_REINTENTO_MS);
      }
    } finally {
      if (esperando) this.marcarEspera(-1);
    }
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
    const respuesta = await this.enviar(`${this.base}${ruta}`, init);
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const datos = esObjeto(cuerpo) ? cuerpo : {};
      const codigo = typeof datos['error'] === 'string' ? datos['error'] : null;
      const mensaje =
        typeof datos['mensaje'] === 'string'
          ? datos['mensaje']
          : `La nube respondió con error ${respuesta.status}`;
      throw new ErrorApi(respuesta.status, codigo, mensaje, datos);
    }
    return cuerpo as T;
  }

  estado(): Promise<{ status: string; version: string }> {
    return this.pedir('/health');
  }

  productos(buscar = '', limite = 50): Promise<Producto[]> {
    const q = `buscar=${encodeURIComponent(buscar)}&limite=${limite}`;
    return this.pedir(`/products?${q}`);
  }

  producto(id: string): Promise<Producto> {
    return this.pedir(`/products/${encodeURIComponent(id)}`);
  }

  editarProducto(id: string, cambios: CambiosProducto): Promise<Producto> {
    return this.pedir(`/products/${encodeURIComponent(id)}`, {
      metodo: 'PATCH',
      cuerpo: cambios,
    });
  }

  cambioMasivo(
    filtro: FiltroPrecios,
    porcentaje: number,
  ): Promise<{ cantidad: number; productos: Producto[] }> {
    return this.pedir('/products/bulk-price', { metodo: 'POST', cuerpo: { filtro, porcentaje } });
  }

  recibir(lineas: readonly LineaRecepcion[]): Promise<ResultadoRecepcion> {
    return this.pedir('/receptions', { metodo: 'POST', cuerpo: { lineas } });
  }

  vincularCaja(
    installationId: string,
    deviceToken: string,
    name: string,
  ): Promise<{ id: string; name: string; linkedAt: string | null }> {
    return this.pedir('/installations/link', {
      metodo: 'POST',
      cuerpo: { installationId, deviceToken, name },
    });
  }

  ventasDelDia(): Promise<ResumenVentas> {
    return this.pedir('/report/sales/today');
  }

  fiado(): Promise<ReporteFiado> {
    return this.pedir('/report/fiado');
  }

  reporte(dias: DiasReporte): Promise<ReporteDueno> {
    return this.pedir(`/report/summary?dias=${String(dias)}`);
  }

  stockBajo(): Promise<ProductoStockBajo[]> {
    return this.pedir('/report/stock-bajo');
  }

  ultimoCierre(): Promise<{ cierre: CierreCaja | null }> {
    return this.pedir('/report/cash-closes');
  }
}
