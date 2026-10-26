import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import { buscarCaja } from '../caja/servicio.js';
import { leerConfiguracion } from '../configuracion/servicio.js';
import type { Db } from '../db/client.js';
import { leerConfigImpresora } from '../impresion/config.js';
import { siiListo } from '../sii/config.js';
import { obtenerIdentidad } from '../sincronizacion/identidad.js';

/** Estado de la primera configuración para la guía del dueño. */
export interface EstadoConfiguracionInicial {
  local: { completo: boolean; faltan: string[] };
  boleta: { confirmada: boolean; modalidad: string; siiListo: boolean };
  impresora: { configurada: boolean; transporte: string; destino: string | null };
  vinculacion: { installationId: string; deviceToken: string; caja: string };
}

export function registrarAsistente(
  app: FastifyInstance,
  deps: { db: Db; sesiones: Sesiones },
): void {
  const soloDueno = requiereSesion(deps.sesiones, ['DUENO']);

  /**
   * Datos para el asistente de primera configuración. Incluye el token de la caja porque lo
   * necesita el QR de vinculación; solo lo ve el dueño. No se cachea.
   */
  app.get('/setup', { onRequest: soloDueno }, (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const { db } = deps;
    const config = leerConfiguracion(db);
    const caja = buscarCaja(db);
    const impresora = caja ? leerConfigImpresora(db, caja.id) : null;
    const identidad = obtenerIdentidad(db);

    const faltan: string[] = [];
    if (!config.rut) faltan.push('RUT');
    if (!config.razonSocial) faltan.push('razón social');
    if (!config.giro) faltan.push('giro');
    if (!config.direccion) faltan.push('dirección');
    if (!config.comuna) faltan.push('comuna');

    return {
      local: { completo: faltan.length === 0, faltan },
      boleta: {
        confirmada: config.boletaConfirmada,
        modalidad: config.dteProvider,
        siiListo: siiListo(db),
      },
      impresora: {
        configurada: impresora !== null && impresora.transporte !== 'DESACTIVADA',
        transporte: impresora?.transporte ?? 'DESACTIVADA',
        destino: impresora?.destino ?? null,
      },
      vinculacion: {
        installationId: identidad.installationId,
        deviceToken: identidad.deviceToken,
        caja: caja?.name ?? 'Caja 1',
      },
    } satisfies EstadoConfiguracionInicial;
  });
}
