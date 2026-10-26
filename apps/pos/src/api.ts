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
  /** Resumen del turno (solo con la caja abierta, o al cerrar). */
  resumen?: ResumenCaja | null;
}

export interface ResumenCaja {
  porMedio: Record<MedioPago, { cantidad: number; cobradoClp: number }>;
  cantidadVentas: number;
  totalVentasClp: number;
  redondeoClp: number;
  totalCobradoClp: number;
  anuladas: { cantidad: number; totalClp: number };
  efectivoInicialClp: number;
  efectivoEsperadoClp: number;
}

export interface CierreCaja {
  caja: Caja;
  sesion: SesionCaja & {
    cerradaPor: { id: string; name: string } | null;
    cerradaEn: string | null;
    efectivoContadoClp: number | null;
    efectivoEsperadoClp: number | null;
    diferenciaClp: number | null;
  };
  resumen: ResumenCaja;
}

export interface AcercaDe {
  app: string;
  version: string;
  developer: { name: string; email: string };
  license: string;
  license_url: string;
  attribution: string;
  sources: { id?: string; nombre?: string; url?: string; export_del?: string }[];
  built_at: string | null;
  product_count: number | null;
}

export type TransporteImpresora = 'DESACTIVADA' | 'RED' | 'SISTEMA' | 'ARCHIVO';

export interface RespaldoLocal {
  nombre: string;
  creadoEn: string;
  tamanoBytes: number;
  incluyeClaveSii: boolean;
}

export interface ConfigImpresora {
  transporte: TransporteImpresora;
  destino: string | null;
  anchoMm: 58 | 80;
  columnas: number | null;
  paginaCodigos: 'CP858' | 'CP850' | 'WPC1252';
  cortar: boolean;
  abrirCajon: boolean;
}

export interface ProductoLocal {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  format: string | null;
  unit: 'UN' | 'KG';
  priceClp: number;
  stockQtyMilli: number;
}

export type FiltroProductos = 'STOCK_BAJO' | 'SIN_STOCK' | 'SIN_CATEGORIA' | 'INACTIVOS';

export interface ProductoListado extends ProductoLocal {
  costClp: number | null;
  stockMinMilli: number | null;
  active: boolean;
  categoryId: string | null;
}

export interface ProductoDetalle extends ProductoListado {
  barcodesAlternativos: string[];
  categoria: string | null;
  margen: number | null;
  taxType: 'AFECTO' | 'EXENTO';
  scaleCode: string | null;
  source: 'SEED' | 'LOCAL';
}

export interface CambiosProducto {
  name?: string;
  brand?: string | null;
  format?: string | null;
  priceClp?: number;
  costClp?: number | null;
  taxType?: 'AFECTO' | 'EXENTO';
  stockMinMilli?: number | null;
  barcode?: string | null;
  scaleCode?: string | null;
  active?: boolean;
}

export interface LineaRecepcion {
  productoId: string;
  cantidadMilli: number;
  costoUnitarioClp?: number;
}

export interface ResultadoRecepcion {
  id: string;
  lineas: {
    productoId: string;
    nombre: string;
    cantidadMilli: number;
    stockAnteriorMilli: number;
    stockNuevoMilli: number;
    costoAnteriorClp: number | null;
    costoNuevoClp: number | null;
  }[];
}

/** Datos de la base de productos (semilla u Open Food Facts): solo falta precio y stock. */
export interface ProductoSugerido {
  barcode: string;
  name: string;
  brand: string | null;
  format: string | null;
  categorySlug?: string | null;
  seedRef?: string | null;
}

export interface DatosAlta {
  barcode: string | null;
  name: string;
  brand?: string | null;
  format?: string | null;
  unit: 'UN' | 'KG';
  priceClp: number;
  stockInicialMilli?: number;
  categorySlug?: string | null;
  seedRef?: string | null;
}

export type DatosBalanza =
  | { codigoProducto: string; tipo: 'PESO'; pesoGramos: number }
  | { codigoProducto: string; tipo: 'PRECIO'; precioClp: number };

export type ResultadoLookup =
  | { origen: 'LOCAL'; producto: ProductoLocal; balanza?: DatosBalanza }
  | {
      origen: 'SEMILLA' | 'OFF';
      producto: ProductoSugerido;
    }
  | { origen: 'NO_ENCONTRADO'; producto: null; balanza?: DatosBalanza };

export interface LineaCotizada {
  productoId: string | null;
  nombre: string;
  unidad: 'UN' | 'KG';
  cantidadMilli: number;
  precioUnitarioClp: number;
  descuentoClp: number;
  totalLineaClp: number;
}

export interface Cotizacion {
  totalClp: number;
  descuentoTotalClp: number;
  lineas: LineaCotizada[];
}

/** Línea como la pide el servidor al cotizar o cobrar. */
export interface LineaPedido {
  productoId: string | null;
  cantidadMilli: number;
  nombre?: string;
  unidad?: 'UN' | 'KG';
  precioUnitarioClp?: number;
  montoFijoClp?: number;
}

export interface BotonRapido {
  id: string;
  label: string;
  posicion: number;
  /** `null` = monto libre con este nombre. */
  producto: ProductoLocal | null;
}

export type MedioPago = 'EFECTIVO' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA';

export type ModalidadBoleta = 'MOCK' | 'PUENTE_MANUAL' | 'SII_DIRECTO' | 'PROVEEDOR_EXTERNO';

export interface ConfiguracionLocal {
  razonSocial: string | null;
  rut?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  dteProvider: ModalidadBoleta;
  boletaConfirmada?: boolean;
  siiListo?: boolean;
  siiFchResol?: string | null;
  siiNroResol?: number | null;
  modoPrueba: boolean;
  modeloEmision: 'SOLO_NO_ELECTRONICOS' | 'TODO_MEDIO_PAGO';
  cashRoundingEnabled: boolean;
  prefijosBalanzaPrecio?: string[];
  modalidadesDisponibles?: ModalidadBoleta[];
}

export interface CambiosConfiguracion {
  razonSocial?: string | null;
  rut?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  dteProvider?: ModalidadBoleta;
  modeloEmision?: 'SOLO_NO_ELECTRONICOS' | 'TODO_MEDIO_PAGO';
  cashRoundingEnabled?: boolean;
  prefijosBalanzaPrecio?: string[];
}

export interface PedidoVenta {
  id: string;
  lineas: readonly LineaPedido[];
  medioPago: MedioPago;
  pagadoClp?: number;
  totalEsperadoClp?: number;
}

export interface VentaRegistrada {
  id: string;
  numero: number;
  estado: 'OK' | 'ANULADA';
  medioPago: MedioPago;
  totalClp: number;
  redondeoClp: number;
  totalCobradoClp: number;
  pagadoClp: number;
  vueltoClp: number;
  documento: {
    provider: string;
    folioExterno: string | null;
    validoComoBoleta: boolean;
    leyendas: readonly string[];
    /** Qué debe hacer el cajero (ej. emitir en e-Boleta). */
    accionCajero: string | null;
  } | null;
  motivoSinDocumento: 'VOUCHER_ES_BOLETA' | 'TOTAL_CERO' | null;
}

export interface ResultadoImpresion {
  impreso: boolean;
  vistaPrevia: string;
  motivo: 'SIN_IMPRESORA' | null;
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

  cerrarCaja(efectivoContadoClp: number): Promise<CierreCaja> {
    return this.pedir<CierreCaja>('/cash/close', {
      metodo: 'POST',
      cuerpo: { efectivoContadoClp },
    });
  }

  imprimirCierre(sesionId: string): Promise<ResultadoImpresion> {
    return this.pedir<ResultadoImpresion>(`/cash/sessions/${encodeURIComponent(sesionId)}/print`, {
      metodo: 'POST',
    });
  }

  ultimaVenta(): Promise<VentaRegistrada & { creadaEn: string; cajero: { name: string } }> {
    return this.pedir('/sales/last');
  }

  anularVenta(
    id: string,
    motivo: string,
    pinDueno?: string,
  ): Promise<{ venta: VentaRegistrada; recordatorio: string | null }> {
    return this.pedir(`/sales/${encodeURIComponent(id)}/void`, {
      metodo: 'POST',
      cuerpo: { motivo, ...(pinDueno ? { pinDueno } : {}) },
    });
  }

  acercaDe(): Promise<AcercaDe> {
    return this.pedir<AcercaDe>('/about');
  }

  guardarConfiguracion(cambios: CambiosConfiguracion): Promise<ConfiguracionLocal> {
    return this.pedir<ConfiguracionLocal>('/settings', { metodo: 'PATCH', cuerpo: cambios });
  }

  impresora(): Promise<ConfigImpresora & { columnasEfectivas: number }> {
    return this.pedir('/printer');
  }

  guardarImpresora(c: ConfigImpresora): Promise<ConfigImpresora & { columnasEfectivas: number }> {
    return this.pedir('/printer', { metodo: 'PUT', cuerpo: c });
  }

  colasSistema(): Promise<{ colas: string[] }> {
    return this.pedir('/printer/system-queues');
  }

  imprimirPrueba(abrirCajon = false): Promise<ResultadoImpresion> {
    return this.pedir<ResultadoImpresion>('/printer/test', {
      metodo: 'POST',
      cuerpo: { abrirCajon },
    });
  }

  abrirCajon(): Promise<{ abierto: boolean }> {
    return this.pedir('/printer/drawer', { metodo: 'POST' });
  }

  abrirCaja(efectivoInicialClp: number): Promise<EstadoCaja> {
    return this.pedir<EstadoCaja>('/cash/open', { metodo: 'POST', cuerpo: { efectivoInicialClp } });
  }

  buscarCodigo(codigo: string): Promise<ResultadoLookup> {
    return this.pedir<ResultadoLookup>(`/products/lookup/${encodeURIComponent(codigo)}`);
  }

  buscarProductos(texto: string): Promise<ProductoLocal[]> {
    return this.pedir<ProductoLocal[]>(`/products?buscar=${encodeURIComponent(texto)}`);
  }

  configuracion(): Promise<ConfiguracionLocal> {
    return this.pedir<ConfiguracionLocal>('/settings');
  }

  respaldos(): Promise<{ respaldos: RespaldoLocal[] }> {
    return this.pedir<{ respaldos: RespaldoLocal[] }>('/backups');
  }

  crearRespaldo(): Promise<RespaldoLocal> {
    return this.pedir<RespaldoLocal>('/backups', { metodo: 'POST' });
  }

  registrarVenta(pedido: PedidoVenta): Promise<VentaRegistrada> {
    return this.pedir<VentaRegistrada>('/sales', { metodo: 'POST', cuerpo: pedido });
  }

  imprimirVenta(id: string, reimpresion = false): Promise<ResultadoImpresion> {
    return this.pedir<ResultadoImpresion>(`/sales/${encodeURIComponent(id)}/print`, {
      metodo: 'POST',
      cuerpo: { reimpresion },
    });
  }

  registrarFolioSii(id: string, folio: string): Promise<VentaRegistrada> {
    return this.pedir<VentaRegistrada>(`/sales/${encodeURIComponent(id)}/folio-sii`, {
      metodo: 'PATCH',
      cuerpo: { folio },
    });
  }

  listarProductos(texto: string, filtro: FiltroProductos | null): Promise<ProductoListado[]> {
    const q = new URLSearchParams({ buscar: texto, limite: '100' });
    if (filtro) q.set('filtro', filtro);
    return this.pedir<ProductoListado[]>(`/products?${q.toString()}`);
  }

  detalleProducto(id: string): Promise<ProductoDetalle> {
    return this.pedir<ProductoDetalle>(`/products/${encodeURIComponent(id)}`);
  }

  editarProducto(id: string, cambios: CambiosProducto): Promise<ProductoDetalle> {
    return this.pedir<ProductoDetalle>(`/products/${encodeURIComponent(id)}`, {
      metodo: 'PATCH',
      cuerpo: cambios,
    });
  }

  ajustarStock(
    id: string,
    ajuste:
      { tipo: 'CONTEO'; stockContadoMilli: number } | { tipo: 'MERMA'; cantidadMilli: number },
  ): Promise<ProductoDetalle> {
    return this.pedir<ProductoDetalle>(`/products/${encodeURIComponent(id)}/stock`, {
      metodo: 'POST',
      cuerpo: ajuste,
    });
  }

  guardarBotones(
    botones: readonly { label: string; productoId: string | null }[],
  ): Promise<BotonRapido[]> {
    return this.pedir<BotonRapido[]>('/quick-buttons', { metodo: 'PUT', cuerpo: { botones } });
  }

  recibir(lineas: readonly LineaRecepcion[]): Promise<ResultadoRecepcion> {
    return this.pedir<ResultadoRecepcion>('/receptions', { metodo: 'POST', cuerpo: { lineas } });
  }

  crearProducto(datos: DatosAlta): Promise<ProductoLocal> {
    return this.pedir<ProductoLocal>('/products', { metodo: 'POST', cuerpo: datos });
  }

  botonesRapidos(): Promise<BotonRapido[]> {
    return this.pedir<BotonRapido[]>('/quick-buttons');
  }

  cotizar(lineas: readonly LineaPedido[]): Promise<Cotizacion> {
    return this.pedir<Cotizacion>('/sales/quote', { metodo: 'POST', cuerpo: { lineas } });
  }
}

/**
 * En el navegador (desarrollo) se usa `/api` y Vite lo redirige al servidor. Dentro de Tauri
 * no hay proxy: `pnpm --filter @almacen/pos build:tauri` usa `.env.tauri` con la dirección
 * directa del servidor local (ADR-005).
 */
export const BASE_API: string = import.meta.env.VITE_ALMACEN_API ?? '/api';

export const api = new ClienteApi(BASE_API);
