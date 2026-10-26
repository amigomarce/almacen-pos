import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import {
  crearRespaldo,
  listarRespaldos,
  podarRespaldos,
  RETENCION_POR_DEFECTO,
  type RespaldoInfo,
} from './servicio.js';

export interface DependenciasRespaldos {
  db: Db;
  sesiones: Sesiones;
  dir: string;
  rutaDb: string;
  rutaClaveSii?: string;
  retener?: number;
}

const aWire = (r: RespaldoInfo) => ({
  nombre: r.nombre,
  creadoEn: r.creadoEn.toISOString(),
  tamanoBytes: r.tamanoBytes,
  incluyeClaveSii: r.incluyeClaveSii,
});

/** Respaldos locales: listar y crear a pedido. Restaurar se hace con la caja detenida. */
export function registrarRespaldos(app: FastifyInstance, deps: DependenciasRespaldos): void {
  const soloDueno = requiereSesion(deps.sesiones, ['DUENO']);

  app.get('/backups', { onRequest: soloDueno }, () => ({
    respaldos: listarRespaldos(deps.dir).map(aWire),
  }));

  app.post('/backups', { onRequest: soloDueno }, async () => {
    const info = await crearRespaldo(deps.db, {
      dir: deps.dir,
      rutaDb: deps.rutaDb,
      ...(deps.rutaClaveSii ? { rutaClaveSii: deps.rutaClaveSii } : {}),
    });
    podarRespaldos(deps.dir, deps.retener ?? RETENCION_POR_DEFECTO);
    return aWire(info);
  });
}
