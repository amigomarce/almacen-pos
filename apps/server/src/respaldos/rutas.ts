import type { FastifyInstance } from 'fastify';
import { requiereSesion } from '../auth/rutas.js';
import { leerConfiguracion } from '../configuracion/servicio.js';
import type { Sesiones } from '../auth/sesiones.js';
import type { Db } from '../db/client.js';
import { claveRespaldoABase64, leerClaveRespaldo } from './cifrado.js';
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
  /** Clave que cifra el respaldo remoto; se genera al pedirla por primera vez. */
  rutaClaveRespaldo?: string;
  retener?: number;
  /** Sube el respaldo recién creado a la nube (si está habilitada). */
  subirNube?: () => Promise<unknown>;
  fetchFn?: typeof fetch;
}

const aWire = (r: RespaldoInfo) => ({
  nombre: r.nombre,
  creadoEn: r.creadoEn.toISOString(),
  tamanoBytes: r.tamanoBytes,
  incluyeClaveSii: r.incluyeClaveSii,
  nube: r.nube,
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
    let final: RespaldoInfo = info;
    if (deps.subirNube) {
      try {
        await deps.subirNube();
      } catch {
        // El respaldo local ya quedó; el ciclo de nube lo reintenta y deja el error en el manifiesto.
      }
      final = listarRespaldos(deps.dir).find((r) => r.nombre === info.nombre) ?? info;
    }
    return aWire(final);
  });

  /** Clave de cifrado de los respaldos remotos. Es un secreto: solo el dueño y sin caché. */
  app.get('/backups/clave', { onRequest: soloDueno }, (_req, reply) => {
    if (!deps.rutaClaveRespaldo) {
      return reply.code(503).send({
        error: 'RESPALDO_CLAVE_NO_CONFIGURADA',
        mensaje: 'La clave de respaldos no está configurada en esta caja',
      });
    }
    reply.header('cache-control', 'no-store');
    return { clave: claveRespaldoABase64(leerClaveRespaldo(deps.rutaClaveRespaldo)) };
  });

  /** Prueba que la URL de nube responda, sin exponer credenciales. */
  app.post('/backups/probar-nube', { onRequest: soloDueno }, async (_req, reply) => {
    const url = leerConfiguracion(deps.db).cloudUrl;
    if (!url) {
      return reply
        .code(400)
        .send({ error: 'NUBE_URL_REQUERIDA', mensaje: 'Configura la dirección de la nube' });
    }
    try {
      const res = await (deps.fetchFn ?? fetch)(`${url.replace(/\/+$/, '')}/health`, {
        // La nube gratis de Render tarda cerca de un minuto en despertar (ADR-023).
        signal: AbortSignal.timeout(75_000),
      });
      const cuerpo = (await res.json().catch(() => null)) as { version?: string } | null;
      return { ok: res.ok, status: res.status, version: cuerpo?.version ?? null };
    } catch {
      return { ok: false, status: 0, version: null };
    }
  });
}
