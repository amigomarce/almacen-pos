import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requiereDueno } from '../auth/requerir.js';
import type { VerificadorJwt } from '../auth/supabase.js';
import {
  cambioMasivoPrecio,
  editarProducto,
  type CambiosProducto,
  type FiltroPrecios,
  type ProductoCloud,
  type RepoProductos,
} from './servicio.js';

export interface DependenciasProductos {
  repo: RepoProductos;
  verificarJwt: VerificadorJwt;
}

/** Lo que ve el dueño en el móvil: sin owner_id, versión ni marcas de tiempo. */
function publico(p: ProductoCloud) {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    format: p.format,
    unit: p.unit,
    categoryId: p.categoryId,
    priceClp: p.priceClp,
    costClp: p.costClp,
    taxType: p.taxType,
    stockMinMilli: p.stockMinMilli,
    active: p.active,
  };
}

/** `req.duenoId` ya lo llenó `requiereDueno`; devuelve 401 si por lo que sea falta. */
function duenoDe(req: FastifyRequest, reply: FastifyReply): string | null {
  if (req.duenoId) return req.duenoId;
  reply.code(401).send({ error: 'NO_AUTENTICADO', mensaje: 'Inicia sesión en la app' });
  return null;
}

export function registrarProductos(
  app: FastifyInstance,
  { repo, verificarJwt }: DependenciasProductos,
): void {
  const conDueno = requiereDueno(verificarJwt);

  app.get<{ Querystring: { buscar?: string; limite?: string } }>(
    '/products',
    { onRequest: conDueno },
    async (req, reply) => {
      const ownerId = duenoDe(req, reply);
      if (!ownerId) return;
      const limite = Math.min(Number(req.query.limite ?? 20) || 20, 100);
      const productos = await repo.listar(ownerId, req.query.buscar ?? '', limite);
      return productos.map(publico);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/products/:id',
    { onRequest: conDueno },
    async (req, reply) => {
      const ownerId = duenoDe(req, reply);
      if (!ownerId) return;
      const p = await repo.porId(ownerId, req.params.id);
      if (!p)
        return reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Producto no encontrado' });
      return publico(p);
    },
  );

  app.patch<{ Params: { id: string }; Body: CambiosProducto }>(
    '/products/:id',
    {
      onRequest: conDueno,
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
            brand: { type: ['string', 'null'], maxLength: 60 },
            format: { type: ['string', 'null'], maxLength: 40 },
            priceClp: { type: 'integer', minimum: 1, maximum: 100_000_000 },
            costClp: { type: ['integer', 'null'], minimum: 0, maximum: 100_000_000 },
            taxType: { type: 'string', enum: ['AFECTO', 'EXENTO'] },
            stockMinMilli: { type: ['integer', 'null'], minimum: 0, maximum: 1_000_000_000 },
            active: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const ownerId = duenoDe(req, reply);
      if (!ownerId) return;
      const r = await editarProducto(repo, {
        ownerId,
        id: req.params.id,
        cambios: req.body,
        ahora: new Date(),
      });
      if (!r.ok) {
        return r.error === 'NO_ENCONTRADO'
          ? reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Producto no encontrado' })
          : reply.code(400).send({ error: 'PRECIO_INVALIDO', mensaje: 'Precio inválido' });
      }
      return publico(r.producto);
    },
  );

  /** Cambio masivo de precios por categoría y/o marca, con un porcentaje (+5, −10...). */
  app.post<{ Body: { filtro: FiltroPrecios; porcentaje: number } }>(
    '/products/bulk-price',
    {
      onRequest: conDueno,
      schema: {
        body: {
          type: 'object',
          required: ['filtro', 'porcentaje'],
          additionalProperties: false,
          properties: {
            filtro: {
              type: 'object',
              minProperties: 1,
              additionalProperties: false,
              properties: {
                categoriaId: { type: 'string', minLength: 1, maxLength: 64 },
                marca: { type: 'string', minLength: 1, maxLength: 60 },
              },
            },
            porcentaje: { type: 'number', minimum: -90, maximum: 1000 },
          },
        },
      },
    },
    async (req, reply) => {
      const ownerId = duenoDe(req, reply);
      if (!ownerId) return;
      const r = await cambioMasivoPrecio(repo, {
        ownerId,
        filtro: req.body.filtro,
        porcentaje: req.body.porcentaje,
        ahora: new Date(),
      });
      return { cantidad: r.cantidad, productos: r.productos.map(publico) };
    },
  );
}
