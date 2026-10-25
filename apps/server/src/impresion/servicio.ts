import { aEscPos, aTexto, CMD, type Documento } from '@almacen/printer';
import type { ConfigImpresora } from './config.js';
import {
  transporteArchivo,
  transporteRed,
  transporteSistema,
  type Transporte,
} from './transportes.js';

export type CrearTransporte = (config: ConfigImpresora) => Transporte | null;

/** Transporte según la configuración; `null` si la impresora está desactivada. */
export const crearTransportePorDefecto: CrearTransporte = (c) => {
  const destino = c.destino ?? '';
  switch (c.transporte) {
    case 'DESACTIVADA':
      return null;
    case 'RED':
      return transporteRed(destino);
    case 'SISTEMA':
      return transporteSistema(destino);
    case 'ARCHIVO':
      return transporteArchivo(destino);
  }
};

export interface ResultadoImpresion {
  impreso: boolean;
  /** Cómo se ve el ticket (para mostrarlo en pantalla aunque no haya impresora). */
  vistaPrevia: string;
  motivo: 'SIN_IMPRESORA' | null;
}

/**
 * Imprime documentos. Los trabajos de una misma caja salen de a uno (en red, dos tickets
 * enviados a la vez se mezclarían en el papel).
 */
export class ServicioImpresion {
  private readonly colas = new Map<string, Promise<unknown>>();

  constructor(private readonly crearTransporte: CrearTransporte = crearTransportePorDefecto) {}

  private enFila<T>(clave: string, trabajo: () => Promise<T>): Promise<T> {
    const anterior = this.colas.get(clave) ?? Promise.resolve();
    const siguiente = anterior.catch(() => undefined).then(trabajo);
    this.colas.set(clave, siguiente);
    return siguiente;
  }

  async imprimir(
    clave: string,
    config: ConfigImpresora,
    doc: Documento,
  ): Promise<ResultadoImpresion> {
    const vistaPrevia = aTexto(doc, config.paginaCodigos);
    const transporte = this.crearTransporte(config);
    if (!transporte) return { impreso: false, vistaPrevia, motivo: 'SIN_IMPRESORA' };
    const bytes = aEscPos(doc, { paginaCodigos: config.paginaCodigos, cortar: config.cortar });
    await this.enFila(clave, () => transporte.enviar(bytes));
    return { impreso: true, vistaPrevia, motivo: null };
  }

  /** Solo el pulso del cajón, sin imprimir ni cortar papel. */
  async abrirCajon(clave: string, config: ConfigImpresora): Promise<boolean> {
    const transporte = this.crearTransporte(config);
    if (!transporte) return false;
    await this.enFila(clave, () =>
      transporte.enviar(Uint8Array.from([...CMD.inicializar, ...CMD.abrirCajon])),
    );
    return true;
  }
}
