import type { Clp, MedioPago, TipoImpuesto, TotalesDocumento, Unidad } from '@almacen/core';

/**
 * ADR-001 §4. `SOLO_NO_ELECTRONICOS` (por defecto): con tarjeta el voucher vale como boleta
 * (Res. 76/2021) y la caja no emite. `TODO_MEDIO_PAGO`: solo si el dueño lo declaró en sii.cl.
 */
export type ModeloEmision = 'SOLO_NO_ELECTRONICOS' | 'TODO_MEDIO_PAGO';

/** 39 = boleta afecta, 41 = boleta exenta. */
export type TipoDte = 39 | 41;

/** Res. Ex. 53/2025: la boleta puede entregarse impresa o virtual. */
export type Entrega = 'IMPRESA' | 'VIRTUAL';

export type NombreProvider = 'MOCK' | 'PUENTE_MANUAL' | 'SII_DIRECTO' | 'PROVEEDOR_EXTERNO';

export type EstadoSii = 'NO_APLICA' | 'PENDIENTE' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'REPARO';

export interface LineaParaDte {
  nombre: string;
  unidad: Unidad;
  cantidadMilli: number;
  precioUnitarioClp: Clp;
  /** Total de la línea con IVA incluido, ya con descuentos. */
  montoClp: Clp;
  tipoImpuesto: TipoImpuesto;
}

export interface VentaParaDte {
  ventaId: string;
  numeroVenta: number;
  fecha: Date;
  medioPago: MedioPago;
  entrega: Entrega;
  lineas: readonly LineaParaDte[];
  /** Calculados con `calcularTotalesDocumento`. Sin redondeo de efectivo. */
  totales: TotalesDocumento;
}

export interface DocumentoEmitido {
  provider: NombreProvider;
  /** `null` si no es un DTE timbrado por nosotros (mock o puente manual). */
  tipoDte: TipoDte | null;
  folio: number | null;
  /** Folio emitido por el cajero en la app e-Boleta del SII (puente manual). */
  folioExterno: string | null;
  entrega: Entrega;
  totales: TotalesDocumento;
  /** Timbre electrónico (para el PDF417). */
  ted: string | null;
  xml: string | null;
  estadoSii: EstadoSii;
  /** Si es `false`, el papel debe decir que NO es boleta. */
  validoComoBoleta: boolean;
  /** Líneas de texto que la impresora debe destacar en el comprobante. */
  leyendas: readonly string[];
  /** Instrucción para el cajero, si debe hacer algo más (ej. emitir en e-Boleta). */
  accionCajero: string | null;
}

export type ResultadoEmision =
  | { emitido: true; documento: DocumentoEmitido }
  | { emitido: false; motivo: 'VOUCHER_ES_BOLETA' | 'TOTAL_CERO' };

export interface ResultadoEnvio {
  folio: number;
  trackId: string | null;
  estado: EstadoSii;
  error: string | null;
}

export interface RefDocumento {
  tipoDte: TipoDte;
  folio: number;
}

/** docs/ARQUITECTURA.md §5. Toda la lógica tributaria pasa por aquí. */
export interface DocumentoTributarioProvider {
  readonly nombre: NombreProvider;
  /** Debe funcionar offline: folio y timbre al instante; el envío es aparte. */
  emitirBoleta(venta: VentaParaDte): Promise<ResultadoEmision>;
  /** Reintenta los documentos pendientes de envío al SII. */
  enviarPendientes(): Promise<ResultadoEnvio[]>;
  consultarEstado(trackId: string): Promise<EstadoSii>;
  anular?(ref: RefDocumento): Promise<ResultadoEmision>;
}
