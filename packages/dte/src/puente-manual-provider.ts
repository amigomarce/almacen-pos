import { ErrorDominio, formatearClp } from '@almacen/core';
import { LEYENDA_COMPROBANTE_INTERNO } from './mock-provider.js';
import { motivoParaNoEmitir } from './reglas.js';
import type {
  DocumentoEmitido,
  DocumentoTributarioProvider,
  EstadoSii,
  ModeloEmision,
  ResultadoEmision,
  ResultadoEnvio,
  VentaParaDte,
} from './tipos.js';

/**
 * Estrategia D (ADR-001), transitoria hasta la Fase 5: la caja NO timbra. Imprime el
 * comprobante interno y le indica al cajero que emita la boleta en la app e-Boleta del SII
 * por el total exacto. Opcionalmente se registra el folio que entregó e-Boleta.
 */
export class PuenteManualProvider implements DocumentoTributarioProvider {
  readonly nombre = 'PUENTE_MANUAL' as const;

  constructor(private readonly modelo: ModeloEmision = 'SOLO_NO_ELECTRONICOS') {}

  emitirBoleta(venta: VentaParaDte): Promise<ResultadoEmision> {
    // Dentro de .then para que un error de validación llegue como promesa rechazada.
    return Promise.resolve().then(() => this.emitir(venta));
  }

  private emitir(venta: VentaParaDte): ResultadoEmision {
    const motivo = motivoParaNoEmitir(venta, this.modelo);
    if (motivo) return { emitido: false, motivo };
    const total = formatearClp(venta.totales.totalClp);
    return {
      emitido: true,
      documento: {
        provider: this.nombre,
        tipoDte: null,
        folio: null,
        folioExterno: null,
        entrega: venta.entrega,
        totales: venta.totales,
        ted: null,
        xml: null,
        estadoSii: 'NO_APLICA',
        validoComoBoleta: false,
        leyendas: [LEYENDA_COMPROBANTE_INTERNO, 'Su boleta se emite en la app e-Boleta del SII'],
        accionCajero: `Emite la boleta en la app e-Boleta del SII por ${total}`,
      },
    };
  }

  /** Guarda el folio de e-Boleta en el documento (devuelve una copia; no muta). */
  registrarFolioExterno(documento: DocumentoEmitido, folio: string): DocumentoEmitido {
    if (documento.provider !== this.nombre) {
      throw new ErrorDominio('PROVIDER_INCORRECTO', 'El documento no es del puente manual');
    }
    const limpio = folio.trim();
    if (!/^\d{1,10}$/.test(limpio) || Number(limpio) === 0) {
      throw new ErrorDominio('FOLIO_INVALIDO', 'El folio debe ser un número mayor a 0');
    }
    return { ...documento, folioExterno: String(Number(limpio)), accionCajero: null };
  }

  /** Nada que enviar: la boleta la envía e-Boleta. */
  enviarPendientes(): Promise<ResultadoEnvio[]> {
    return Promise.resolve([]);
  }

  consultarEstado(_trackId: string): Promise<EstadoSii> {
    return Promise.resolve('NO_APLICA');
  }
}
