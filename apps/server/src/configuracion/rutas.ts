import { MODALIDADES_DISPONIBLES } from '@almacen/dte';
import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import {
  actualizarConfiguracion,
  leerConfiguracion,
  type CambiosConfiguracion,
} from './servicio.js';

const TEXTO = { type: ['string', 'null'], maxLength: 120 } as const;

export function registrarConfiguracion(
  app: FastifyInstance,
  deps: { db: Db; sesiones: Sesiones; permitirModoPrueba: boolean },
): void {
  const { db, sesiones, permitirModoPrueba } = deps;

  /** La caja la necesita para el aviso de modo prueba y el flujo de cobro. */
  app.get('/settings', { onRequest: requiereSesion(sesiones) }, () => ({
    ...leerConfiguracion(db),
    modalidadesDisponibles: MODALIDADES_DISPONIBLES.filter(
      (m) => m !== 'MOCK' || permitirModoPrueba,
    ),
  }));

  app.patch<{ Body: CambiosConfiguracion }>(
    '/settings',
    {
      onRequest: requiereSesion(sesiones, ['DUENO']),
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            rut: { type: ['string', 'null'], maxLength: 15 },
            razonSocial: TEXTO,
            giro: TEXTO,
            direccion: TEXTO,
            comuna: TEXTO,
            modeloEmision: { type: 'string', enum: ['SOLO_NO_ELECTRONICOS', 'TODO_MEDIO_PAGO'] },
            dteProvider: {
              type: 'string',
              enum: ['MOCK', 'PUENTE_MANUAL', 'SII_DIRECTO', 'PROVEEDOR_EXTERNO'],
            },
            cashRoundingEnabled: { type: 'boolean' },
          },
        },
      },
    },
    (req) => {
      const { antes, despues } = actualizarConfiguracion(db, req.body, { permitirModoPrueba });
      if (antes.dteProvider !== despues.dteProvider) {
        req.log.warn(
          { de: antes.dteProvider, a: despues.dteProvider, usuario: req.sesion?.usuario.name },
          'Cambio de modalidad de boleta',
        );
      }
      return despues;
    },
  );
}
