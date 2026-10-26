import { MODALIDADES_DISPONIBLES } from '@almacen/dte';
import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import { ambienteSii, siiListo } from '../sii/config.js';
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

  /**
   * Estado del SII para elegir modalidad. `permitirModoPrueba` marca desarrollo: ahí se acepta
   * el ambiente de certificación (producción está prohibida); en una caja real `SII_DIRECTO`
   * exige credenciales de producción, es decir, la certificación ya hecha (CLAUDE.md §2).
   */
  const estadoSii = () => {
    const listo = siiListo(db);
    const ambiente = ambienteSii(db);
    const certificado = ambiente === 'produccion';
    return {
      listo,
      ambiente,
      certificado,
      habilitado: listo && (certificado || permitirModoPrueba),
    };
  };

  /** La caja la necesita para el aviso de modo prueba y el flujo de cobro. */
  app.get('/settings', { onRequest: requiereSesion(sesiones) }, () => {
    const sii = estadoSii();
    return {
      ...leerConfiguracion(db),
      siiListo: sii.listo,
      siiAmbiente: sii.ambiente,
      modalidadesDisponibles: MODALIDADES_DISPONIBLES.filter(
        (m) => (m !== 'MOCK' || permitirModoPrueba) && (m !== 'SII_DIRECTO' || sii.habilitado),
      ),
    };
  });

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
            cloudUrl: { type: ['string', 'null'], maxLength: 300 },
            cloudBackupEnabled: { type: 'boolean' },
            cloudBackupRetention: { type: 'integer', minimum: 1, maximum: 30 },
            cashRoundingEnabled: { type: 'boolean' },
            prefijosBalanzaPrecio: {
              type: 'array',
              maxItems: 10,
              items: { type: 'string', pattern: '^2[0-9]$' },
            },
          },
        },
      },
    },
    (req) => {
      const sii = estadoSii();
      const { antes, despues } = actualizarConfiguracion(db, req.body, {
        permitirModoPrueba,
        siiListo: sii.listo,
        siiCertificado: sii.certificado,
      });
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
