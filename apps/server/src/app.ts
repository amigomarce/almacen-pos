import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { ErrorDominio, type ConfigBalanza } from '@almacen/core';
import { LICENCIA, TEXTO_ATRIBUCION, URL_LICENCIA } from '@almacen/data';
import pkg from '../package.json' with { type: 'json' };
import { LimitadorIntentos } from './auth/intentos.js';
import { registrarAuth } from './auth/rutas.js';
import { Sesiones } from './auth/sesiones.js';
import { registrarCaja } from './caja/rutas.js';
import { registrarConfiguracion } from './configuracion/rutas.js';
import { configBalanzaDe, leerConfiguracion } from './configuracion/servicio.js';
import type { Db } from './db/client.js';
import { ErrorHttp } from './errores.js';
import { registrarImpresion } from './impresion/rutas.js';
import { ServicioImpresion } from './impresion/servicio.js';
import type { Ejecutar } from './impresion/transportes.js';
import { registrarVentas } from './ventas/rutas.js';
import {
  cargarTaxonomiaPorDefecto,
  crearProducto,
  type DatosAlta,
  type Taxonomia,
} from './productos/alta.js';
import { registrarBotones } from './productos/botones.js';
import { buscarProductos } from './productos/busqueda.js';
import { buscarProducto, type DependenciasLookup } from './productos/lookup.js';
import { requiereSesion } from './auth/rutas.js';
import type { Semilla } from './productos/semilla.js';

export interface OpcionesApp {
  db: Db;
  /** Base semilla de productos; `null` o ausente = la caja funciona sin sugerencias. */
  semilla?: Semilla | null;
  /** Consulta en línea a Open Food Facts; `null` o ausente = sin internet. */
  off?: DependenciasLookup['off'];
  configBalanza?: ConfigBalanza;
  /** Inyectables para tests (reloj controlado). */
  sesiones?: Sesiones;
  intentos?: LimitadorIntentos;
  /** `false` en producción: no se puede elegir la modalidad MOCK. */
  permitirModoPrueba?: boolean;
  /** Inyectable para tests (transporte falso). */
  impresion?: ServicioImpresion;
  ejecutar?: Ejecutar;
  /** Categorías de la semilla (`data/categorias.csv`). */
  taxonomia?: Taxonomia;
  logger?: boolean;
}

export function crearApp({
  db,
  semilla = null,
  off = null,
  configBalanza,
  sesiones = new Sesiones(),
  intentos = new LimitadorIntentos(),
  permitirModoPrueba = true,
  impresion = new ServicioImpresion(),
  ejecutar,
  taxonomia = cargarTaxonomiaPorDefecto(),
  logger = false,
}: OpcionesApp): FastifyInstance {
  const app = Fastify({
    logger,
    // Sin conversión de tipos: un `null` o "1000" en un monto es un error, no $0 ni $1.000.
    ajv: { customOptions: { coerceTypes: false } },
  });

  // Mismo formato de error en toda la API: { error, mensaje }.
  app.setErrorHandler<FastifyError>((error, _req, reply) => {
    if (error.validation) {
      return reply
        .code(400)
        .send({ error: 'DATOS_INVALIDOS', mensaje: 'Datos inválidos', detalle: error.message });
    }
    // Reglas del dominio (packages/core): el mensaje ya está en español para el cajero.
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

  registrarAuth(app, { db, sesiones, intentos });
  registrarCaja(app, { db, sesiones });
  registrarConfiguracion(app, { db, sesiones, permitirModoPrueba });
  registrarVentas(app, { db, sesiones, intentos });
  registrarBotones(app, { db, sesiones });
  registrarImpresion(app, { db, sesiones, impresion, ...(ejecutar ? { ejecutar } : {}) });

  app.get('/health', () => {
    let estadoDb: 'ok' | 'error' = 'ok';
    try {
      db.get(sql`select 1`);
    } catch {
      estadoDb = 'error';
    }
    // Público (sin sesión) para que la pantalla de PIN ya muestre el aviso de modo prueba.
    let modalidadBoleta: string | null = null;
    try {
      modalidadBoleta = leerConfiguracion(db).dteProvider;
    } catch {
      // Base sin migrar o caída: se informa como null.
    }
    return {
      status: estadoDb === 'ok' ? 'ok' : 'degradado',
      version: pkg.version,
      db: estadoDb,
      semilla: semilla !== null,
      modalidadBoleta,
      modoPrueba: modalidadBoleta === 'MOCK',
      hora: new Date().toISOString(),
    };
  });

  /**
   * Para la pantalla "Acerca de" (ADR-004, ODbL §4.3): atribución de los datos de productos.
   * Sale de `seed_meta`; sin semilla se usa el mismo texto, porque la consulta en línea
   * también trae datos de Open Food Facts.
   */
  app.get('/about', () => {
    const meta = semilla?.meta ?? {};
    let sources: unknown;
    try {
      sources = JSON.parse(meta['sources'] ?? '[]');
    } catch {
      sources = [];
    }
    return {
      app: 'Almacén POS',
      version: pkg.version,
      license: meta['license'] ?? LICENCIA,
      license_url: meta['license_url'] ?? URL_LICENCIA,
      attribution: meta['attribution'] ?? TEXTO_ATRIBUCION,
      sources,
      built_at: meta['built_at'] ?? null,
      product_count: meta['product_count'] ? Number(meta['product_count']) : null,
    };
  });

  /** Búsqueda por nombre, marca o código (F2 en la caja). */
  app.get<{ Querystring: { buscar?: string; limite?: string } }>(
    '/products',
    { onRequest: requiereSesion(sesiones) },
    (req) => buscarProductos(db, req.query.buscar ?? '', Number(req.query.limite ?? 20) || 20),
  );

  /** Alta rápida desde la caja (código desconocido): datos sugeridos + precio y stock. */
  app.post<{ Body: DatosAlta }>(
    '/products',
    {
      onRequest: requiereSesion(sesiones),
      schema: {
        body: {
          type: 'object',
          required: ['name', 'unit', 'priceClp'],
          additionalProperties: false,
          properties: {
            barcode: { type: ['string', 'null'], maxLength: 20 },
            name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
            brand: { type: ['string', 'null'], maxLength: 60 },
            format: { type: ['string', 'null'], maxLength: 40 },
            unit: { type: 'string', enum: ['UN', 'KG'] },
            priceClp: { type: 'integer', minimum: 1, maximum: 100_000_000 },
            stockInicialMilli: { type: 'integer', minimum: 0, maximum: 1_000_000_000 },
            categorySlug: { type: ['string', 'null'], maxLength: 60 },
            seedRef: { type: ['string', 'null'], maxLength: 20 },
            taxType: { type: 'string', enum: ['AFECTO', 'EXENTO'] },
          },
        },
      },
    },
    (req, reply) => {
      const p = crearProducto(db, req.body, req.sesion?.usuario.id ?? '', taxonomia);
      req.log.info(
        { producto: p.name, precio: p.priceClp, usuario: req.sesion?.usuario.name },
        'Producto creado',
      );
      return reply.code(201).send(p);
    },
  );

  app.get<{ Params: { barcode: string } }>('/products/lookup/:barcode', async (req, reply) => {
    const r = await buscarProducto(
      { db, semilla, off, configBalanza: configBalanza ?? configBalanzaDe(leerConfiguracion(db)) },
      req.params.barcode,
    );
    if ('error' in r) return reply.code(400).send(r);
    return r;
  });

  return app;
}
