import type { ResultadoEnvio } from '@almacen/dte';
import { leerConfiguracion } from '../configuracion/servicio.js';
import type { Db } from '../db/client.js';
import { crearProviderDeVenta, type DependenciasSii } from './proveedor.js';

/** Lo mínimo del logger de Fastify que usa el envío de fondo. */
export interface LoggerSii {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/** Intervalo por defecto del ciclo de envío: 2 minutos (el plazo legal es 1 hora). */
export const INTERVALO_ENVIO_SII_MS = 2 * 60_000;

/**
 * Envía las boletas pendientes si el local usa `SII_DIRECTO`. Si no, no hace nada: la
 * instalación con `PUENTE_MANUAL` no tiene cola propia.
 */
export async function enviarPendientesSii(
  db: Db,
  dependencias: DependenciasSii,
): Promise<ResultadoEnvio[]> {
  const config = leerConfiguracion(db);
  if (config.dteProvider !== 'SII_DIRECTO') return [];
  const provider = crearProviderDeVenta(db, config, dependencias);
  return provider.enviarPendientes();
}

/**
 * Arranca el ciclo de envío. Evita solapar pasadas si una anterior sigue esperando al SII.
 * Devuelve la función para detenerlo (tests y cierre ordenado).
 */
export function iniciarEnvioSii(
  db: Db,
  dependencias: DependenciasSii & { intervaloMs?: number; log: LoggerSii },
): () => void {
  let enCurso = false;

  const pasada = async (): Promise<void> => {
    if (enCurso) return;
    enCurso = true;
    try {
      const resultados = await enviarPendientesSii(db, dependencias);
      const errores = resultados.filter((r) => r.error !== null);
      if (resultados.length > 0) {
        dependencias.log.info(
          { enviadas: resultados.length - errores.length, conError: errores.length },
          'Cola de boletas del SII procesada',
        );
      }
      if (errores.length > 0) {
        dependencias.log.warn(
          { primerError: errores[0]?.error ?? null },
          'El SII no recibió todas las boletas; se reintentará',
        );
      }
    } catch (error) {
      dependencias.log.error({ err: error }, 'Falló el envío de boletas al SII');
    } finally {
      enCurso = false;
    }
  };

  void pasada();
  const timer = setInterval(() => {
    void pasada();
  }, dependencias.intervaloMs ?? INTERVALO_ENVIO_SII_MS);
  return () => {
    clearInterval(timer);
  };
}
