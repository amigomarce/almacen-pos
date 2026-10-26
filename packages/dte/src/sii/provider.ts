import { formatearClp } from '@almacen/core';
import { motivoParaNoEmitir, tipoDteSegunTotales } from '../reglas.js';
import type {
  DocumentoTributarioProvider,
  DocumentoEmitido,
  EstadoSii,
  ModeloEmision,
  ResultadoEmision,
  ResultadoEnvio,
  TipoDte,
  VentaParaDte,
} from '../tipos.js';
import { generarDte } from './documento.js';
import { generarEnvioBoleta, MAX_BOLETAS_POR_ENVIO } from './envio.js';
import type { ClienteSii, EstadoEnvioDetalladoSii, ResultadoEnvioSii } from './cliente.js';
import type { Caf, CertificadoFirma, DocumentoGenerado, EmisorDte } from './tipos.js';

/** Lote máximo de documentos que se intentan enviar en una sola pasada. */
export const MAX_LOTES_POR_TANDA = 10;

/** Reintentos por boleta antes de dejarla pendiente para intervención manual. */
export const MAX_INTENTOS_ENVIO = 10;

/** Primera espera tras un fallo; se duplica en cada reintento. */
export const ESPERA_BASE_MS = 60_000;

/** Tope de la espera entre reintentos. */
export const ESPERA_MAX_MS = 30 * 60_000;

/** Folio reservado del CAF, con el CAF ya parseado para timbrar. */
export interface FolioReservado {
  caf: Caf;
  folio: number;
}

/** Boleta guardada en la cola local, todavía sin enviar al SII. */
export interface BoletaPendienteSii {
  /** Identificador del documento en el almacén local. */
  id: string;
  tipoDte: TipoDte;
  folio: number;
  xml: string;
  intentos: number;
  ultimoIntento: Date | null;
}

/** Datos que el proveedor entrega al almacén al emitir una boleta. */
export interface BoletaParaGuardarSii {
  venta: VentaParaDte;
  documento: DocumentoGenerado;
}

/**
 * Persistencia que necesita el proveedor SII. La implementación real vive en el servidor
 * local (SQLite): los folios en `caf_ranges` y la cola en `tax_documents`. Mantenerla como
 * puerto permite probar el proveedor entero sin base de datos ni red.
 */
export interface RepositorioSii {
  /** Reserva el siguiente folio y lo persiste. Un folio reservado no se reutiliza. */
  reservarFolio(tipoDte: TipoDte): Promise<FolioReservado>;
  /** Guarda el DTE firmado como pendiente de envío. */
  guardarPendiente(boleta: BoletaParaGuardarSii): Promise<void>;
  /** Documentos pendientes, en orden de emisión. */
  pendientes(): Promise<readonly BoletaPendienteSii[]>;
  marcarEnviada(
    id: string,
    datos: { trackId: string; estado: EstadoSii; ahora: Date },
  ): Promise<void>;
  marcarError(id: string, datos: { error: string; ahora: Date }): Promise<void>;
  /** Refleja en la cola el estado que devolvió el SII al consultar el track id. */
  actualizarEstado(trackId: string, estado: EstadoSii): Promise<void>;
}

/** Lo que el proveedor necesita del cliente HTTP del SII (inyectable en tests). */
export interface ClienteSiiPort {
  enviarBoletas(xml: string, nombreArchivo: string): Promise<ResultadoEnvioSii>;
  consultarEstado(trackId: number | string): Promise<EstadoEnvioDetalladoSii>;
}

export interface OpcionesSiiDirecto {
  /** Modelo de emisión del local (voucher con tarjeta o boleta en todo medio de pago). */
  modelo?: ModeloEmision;
  emisor: EmisorDte;
  /** RUT de quien hace el envío (normalmente el mismo emisor). */
  rutEnvia: string;
  /** Fecha de la resolución que autoriza la emisión (AAAA-MM-DD). */
  fchResol: string;
  /** Número de la resolución. */
  nroResol: number;
  certificado: CertificadoFirma;
  repositorio: RepositorioSii;
  cliente: ClienteSiiPort | ClienteSii;
  /** Reloj inyectable. */
  ahora?: () => Date;
  maxIntentos?: number;
  esperaBaseMs?: number;
  esperaMaxMs?: number;
}

const TITULO: Record<TipoDte, string> = {
  39: 'BOLETA ELECTRÓNICA',
  41: 'BOLETA ELECTRÓNICA EXENTA',
};

/**
 * Estrategia A (ADR-001): emite la boleta **offline** con el CAF local y deja el envío al
 * SII en una cola persistente. La emisión nunca espera a la red; `enviarPendientes` se
 * llama desde el ciclo de fondo del servidor y reintenta con espera exponencial.
 *
 * El folio se reserva **antes** de generar el XML. Si la generación falla, el folio queda
 * quemado (no se reutiliza): el SII exige correlatividad y reutilizar un folio es peor que
 * saltarse uno. Ver ADR-010.
 */
export class SiiDirectoProvider implements DocumentoTributarioProvider {
  readonly nombre = 'SII_DIRECTO' as const;

  private readonly modelo: ModeloEmision;
  private readonly emisor: EmisorDte;
  private readonly rutEnvia: string;
  private readonly fchResol: string;
  private readonly nroResol: number;
  private readonly certificado: CertificadoFirma;
  private readonly repositorio: RepositorioSii;
  private readonly cliente: ClienteSiiPort;
  private readonly ahora: () => Date;
  private readonly maxIntentos: number;
  private readonly esperaBaseMs: number;
  private readonly esperaMaxMs: number;

  constructor(opciones: OpcionesSiiDirecto) {
    this.modelo = opciones.modelo ?? 'SOLO_NO_ELECTRONICOS';
    this.emisor = opciones.emisor;
    this.rutEnvia = opciones.rutEnvia;
    this.fchResol = opciones.fchResol;
    this.nroResol = opciones.nroResol;
    this.certificado = opciones.certificado;
    this.repositorio = opciones.repositorio;
    this.cliente = opciones.cliente;
    this.ahora = opciones.ahora ?? (() => new Date());
    this.maxIntentos = opciones.maxIntentos ?? MAX_INTENTOS_ENVIO;
    this.esperaBaseMs = opciones.esperaBaseMs ?? ESPERA_BASE_MS;
    this.esperaMaxMs = opciones.esperaMaxMs ?? ESPERA_MAX_MS;
  }

  /**
   * Timbra la boleta al instante y la deja en la cola local. No usa la red: el CAF y la
   * clave privada viven en el equipo. Si no hay folios disponibles falla con `CAF_AGOTADO`
   * (la venta ya quedó guardada; el dueño debe cargar un CAF nuevo).
   */
  async emitirBoleta(venta: VentaParaDte): Promise<ResultadoEmision> {
    const motivo = motivoParaNoEmitir(venta, this.modelo);
    if (motivo) return { emitido: false, motivo };

    const tipoDte = tipoDteSegunTotales(venta.totales);
    const { caf, folio } = await this.repositorio.reservarFolio(tipoDte);
    const documento = generarDte({
      venta,
      emisor: this.emisor,
      caf,
      folio,
      certificado: this.certificado,
      idDocumento: `T${tipoDte}F${folio}`,
      ahora: this.ahora(),
    });
    await this.repositorio.guardarPendiente({ venta, documento });

    return { emitido: true, documento: documentoEmitido(venta, documento) };
  }

  /**
   * Envía los pendientes en lotes de 50. Si un lote falla, registra el error en cada boleta
   * y se detiene: el próximo ciclo reintenta solo las que ya cumplieron su espera.
   */
  async enviarPendientes(): Promise<ResultadoEnvio[]> {
    const resultados: ResultadoEnvio[] = [];

    for (let tanda = 0; tanda < MAX_LOTES_POR_TANDA; tanda += 1) {
      const ahora = this.ahora();
      const pendientes = await this.repositorio.pendientes();
      const elegibles = pendientes
        .filter((p) => this.puedeReintentar(p, ahora))
        .slice(0, MAX_BOLETAS_POR_ENVIO);
      if (elegibles.length === 0) break;

      let envio: ReturnType<typeof generarEnvioBoleta>;
      try {
        envio = generarEnvioBoleta({
          rutEmisor: this.emisor.rut,
          rutEnvia: this.rutEnvia,
          documentos: elegibles.map((p) => ({
            tipoDte: p.tipoDte,
            folio: p.folio,
            xml: p.xml,
            ted: '',
          })),
          fchResol: this.fchResol,
          nroResol: this.nroResol,
          certificado: this.certificado,
          ahora,
        });
      } catch (error) {
        await this.registrarError(elegibles, error, ahora);
        resultados.push(...resultadosError(elegibles, error));
        break;
      }

      try {
        const respuesta = await this.cliente.enviarBoletas(envio.xml, envio.nombreArchivo);
        const trackId = String(respuesta.trackId);
        await Promise.all(
          elegibles.map((p) =>
            this.repositorio.marcarEnviada(p.id, { trackId, estado: 'ENVIADO', ahora }),
          ),
        );
        resultados.push(
          ...elegibles.map((p): ResultadoEnvio => ({
            folio: p.folio,
            trackId,
            estado: 'ENVIADO',
            error: null,
          })),
        );
      } catch (error) {
        await this.registrarError(elegibles, error, ahora);
        resultados.push(...resultadosError(elegibles, error));
        break;
      }
    }

    return resultados;
  }

  /**
   * Consulta el envío y deja en la cola el estado definitivo. El detalle por documento manda
   * sobre el estado global: una boleta puede ser aceptada aunque el envío siga en proceso.
   */
  async consultarEstado(trackId: string): Promise<EstadoSii> {
    const detalle = await this.cliente.consultarEstado(trackId);
    const estado = estadoDesdeRespuesta(detalle);
    await this.repositorio.actualizarEstado(trackId, estado);
    return estado;
  }

  private puedeReintentar(boleta: BoletaPendienteSii, ahora: Date): boolean {
    if (boleta.intentos >= this.maxIntentos) return false;
    if (!boleta.ultimoIntento) return true;
    return ahora.getTime() - boleta.ultimoIntento.getTime() >= this.espera(boleta.intentos);
  }

  private espera(intentos: number): number {
    if (intentos <= 0) return 0;
    return Math.min(this.esperaBaseMs * 2 ** (intentos - 1), this.esperaMaxMs);
  }

  private async registrarError(
    boletas: readonly BoletaPendienteSii[],
    error: unknown,
    ahora: Date,
  ): Promise<void> {
    const mensaje = mensajeDeError(error);
    await Promise.all(
      boletas.map((p) => this.repositorio.marcarError(p.id, { error: mensaje, ahora })),
    );
  }
}

function documentoEmitido(venta: VentaParaDte, documento: DocumentoGenerado): DocumentoEmitido {
  return {
    provider: 'SII_DIRECTO',
    tipoDte: documento.tipoDte,
    folio: documento.folio,
    folioExterno: null,
    entrega: venta.entrega,
    totales: venta.totales,
    ted: documento.ted,
    xml: documento.xml,
    estadoSii: 'PENDIENTE',
    validoComoBoleta: true,
    leyendas: leyendasBoleta(documento.tipoDte, documento.folio, venta.totales.totalClp),
    accionCajero: null,
  };
}

/** Leyendas de una boleta electrónica emitida por la caja (también para la reimpresión). */
export function leyendasBoleta(
  tipoDte: TipoDte,
  folio: number,
  totalClp: number,
): readonly string[] {
  return [
    TITULO[tipoDte],
    `Folio ${folio} · Total ${formatearClp(totalClp)}`,
    'Verifique documento en www.sii.cl',
  ];
}

function resultadosError(boletas: readonly BoletaPendienteSii[], error: unknown): ResultadoEnvio[] {
  const mensaje = mensajeDeError(error);
  return boletas.map((p) => ({
    folio: p.folio,
    trackId: null,
    estado: 'PENDIENTE',
    error: mensaje,
  }));
}

/**
 * Traduce la respuesta del SII al estado del documento:
 * - cualquier documento rechazado → `RECHAZADO`;
 * - alguno con reparos → `REPARO`;
 * - todos `DOK` → `ACEPTADO`;
 * - sin detalle, el estado global (REC/EPR/… → `ENVIADO`).
 */
export function estadoDesdeRespuesta(detalle: EstadoEnvioDetalladoSii): EstadoSii {
  if (detalle.detalle.some((d) => d.estado === 'RCH' || d.estado === 'RLV')) {
    return 'RECHAZADO';
  }
  if (detalle.detalle.some((d) => d.estado === 'RPR')) return 'REPARO';
  if (detalle.detalle.length > 0 && detalle.detalle.every((d) => d.estado === 'DOK')) {
    return 'ACEPTADO';
  }
  switch (detalle.estado) {
    case 'RCH':
    case 'RCO':
    case 'VOF':
    case 'RFR':
    case 'RPT':
    case 'RSC':
    case 'RCT':
      return 'RECHAZADO';
    case 'RPR':
      return 'REPARO';
    default:
      return 'ENVIADO';
  }
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
