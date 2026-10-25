import { formatearClp } from '@almacen/core';
import { motivoParaNoEmitir } from './reglas.js';
import type {
  DocumentoTributarioProvider,
  EstadoSii,
  ModeloEmision,
  ResultadoEmision,
  ResultadoEnvio,
  VentaParaDte,
} from './tipos.js';

export const LEYENDA_COMPROBANTE_INTERNO = 'COMPROBANTE INTERNO – NO VÁLIDO COMO BOLETA';

/** Desarrollo y demos: no timbra ni envía nada (CLAUDE.md §2). */
export class MockProvider implements DocumentoTributarioProvider {
  readonly nombre = 'MOCK' as const;

  constructor(private readonly modelo: ModeloEmision = 'SOLO_NO_ELECTRONICOS') {}

  emitirBoleta(venta: VentaParaDte): Promise<ResultadoEmision> {
    // Dentro de .then para que un error de validación llegue como promesa rechazada.
    return Promise.resolve().then(() => this.emitir(venta));
  }

  private emitir(venta: VentaParaDte): ResultadoEmision {
    const motivo = motivoParaNoEmitir(venta, this.modelo);
    if (motivo) return { emitido: false, motivo };
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
        leyendas: [
          LEYENDA_COMPROBANTE_INTERNO,
          `Comprobante N° ${venta.numeroVenta} · Total ${formatearClp(venta.totales.totalClp)}`,
        ],
        accionCajero: null,
      },
    };
  }

  enviarPendientes(): Promise<ResultadoEnvio[]> {
    return Promise.resolve([]);
  }

  consultarEstado(_trackId: string): Promise<EstadoSii> {
    return Promise.resolve('NO_APLICA');
  }
}
