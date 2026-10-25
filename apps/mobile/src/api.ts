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
  totalClp: number;
  cantidad: number;
  porMedio: Record<string, number>;
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

export class ClienteApi {
  private token: string | null = null;

  constructor(
    private readonly base: string,
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
  ) {}

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

  stockBajo(): Promise<ProductoStockBajo[]> {
    return this.pedir('/report/stock-bajo');
  }

  ultimoCierre(): Promise<{ cierre: CierreCaja | null }> {
    return this.pedir('/report/cash-closes');
  }
}
