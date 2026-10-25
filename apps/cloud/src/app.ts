import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { ErrorDominio } from '@almacen/core';
import pkg from '../package.json' with { type: 'json' };
import type { VerificadorJwt } from './auth/supabase.js';
import type { Db } from './db/client.js';
import { ErrorHttp } from './errores.js';
import { crearRepoInstalaciones } from './instalaciones/repo.js';
import { registrarInstalaciones } from './instalaciones/rutas.js';
import type { RepoInstalaciones } from './instalaciones/servicio.js';
import { crearRepoProductos } from './productos/repo.js';
import { registrarProductos } from './productos/rutas.js';
import type { RepoProductos } from './productos/servicio.js';
import { crearRepoReportes } from './reportes/repo.js';
import { registrarReportes } from './reportes/rutas.js';
import type { RepoReportes } from './reportes/servicio.js';
import { crearRepoRecepciones } from './recepciones/repo.js';
import { registrarRecepciones } from './recepciones/rutas.js';
import type { RepoRecepciones } from './recepciones/servicio.js';
import { crearRepoSyncNube } from './sincronizacion/repo.js';
import { registrarSincronizacion } from './sincronizacion/rutas.js';
import type { RepoSyncNube } from './sincronizacion/servicio.js';

export interface OpcionesApp {
  db: Db;
  /** Inyectables para tests; por defecto el repo real y un verificador que siempre falla. */
  repoInstalaciones?: RepoInstalaciones;
  repoProductos?: RepoProductos;
  repoReportes?: RepoReportes;
  repoRecepciones?: RepoRecepciones;
  repoSync?: RepoSyncNube;
  verificarJwt?: VerificadorJwt;
  logger?: boolean;
}

export function crearApp({
  db,
  repoInstalaciones = crearRepoInstalaciones(db),
  repoProductos = crearRepoProductos(db),
  repoReportes = crearRepoReportes(db),
  repoRecepciones = crearRepoRecepciones(db),
  repoSync = crearRepoSyncNube(db),
  verificarJwt = () => Promise.resolve(null),
  logger = false,
}: OpcionesApp): FastifyInstance {
  const app = Fastify({ logger });

  // Mismo formato de error en toda la API: { error, mensaje }.
  app.setErrorHandler<FastifyError>((error, _req, reply) => {
    if (error.validation) {
      return reply
        .code(400)
        .send({ error: 'DATOS_INVALIDOS', mensaje: 'Datos inválidos', detalle: error.message });
    }
    if (error instanceof ErrorHttp) {
      return reply
        .code(error.estadoHttp)
        .send({ error: error.codigo, mensaje: error.message, ...error.datos });
    }
    if (error instanceof ErrorDominio) {
      return reply.code(400).send({ error: error.codigo, mensaje: error.message });
    }
    app.log.error(error);
    const estado = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.code(estado).send({
      error: estado === 500 ? 'ERROR_INTERNO' : error.code,
      mensaje: estado === 500 ? 'Error interno del servidor' : error.message,
    });
  });

  // Público: lo consulta el dueño (móvil) y la caja para saber que la nube responde.
  app.get('/health', async () => {
    let estadoDb: 'ok' | 'error' = 'ok';
    try {
      await db.execute(sql`select 1`);
    } catch {
      estadoDb = 'error';
    }
    return {
      status: estadoDb === 'ok' ? 'ok' : 'degradado',
      version: pkg.version,
      db: estadoDb,
      hora: new Date().toISOString(),
    };
  });

  registrarInstalaciones(app, { repo: repoInstalaciones, verificarJwt });
  registrarSincronizacion(app, { repoInstalaciones, repoSync });
  registrarProductos(app, { repo: repoProductos, verificarJwt });
  registrarReportes(app, { repo: repoReportes, verificarJwt });
  registrarRecepciones(app, { repo: repoRecepciones, verificarJwt });

  return app;
}
