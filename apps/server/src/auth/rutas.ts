import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from 'fastify';
import type { Db } from '../db/client.js';
import { registers, ROLES, type Rol } from '../db/schema.js';
import { autorizarDueno } from './autorizacion.js';
import type { LimitadorIntentos } from './intentos.js';
import type { Sesion, Sesiones } from './sesiones.js';
import {
  autenticar,
  buscarUsuario,
  contarDuenosActivos,
  crearUsuario,
  editarUsuario,
  listarUsuarios,
  listarUsuariosActivos,
  type CambiosUsuario,
} from './usuarios.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Sesión de quien llama; la llena `requiereSesion`. */
    sesion: Sesion | null;
  }
}

export interface DependenciasAuth {
  db: Db;
  sesiones: Sesiones;
  intentos: LimitadorIntentos;
}

const PIN = { type: 'string', pattern: '^[0-9]{4,8}$' } as const;
const NOMBRE = { type: 'string', minLength: 1, maxLength: 40, pattern: '\\S' } as const;
const ROL = { type: 'string', enum: [...ROLES] } as const;
const PERSONA = {
  type: 'object',
  required: ['nombre', 'pin'],
  additionalProperties: false,
  properties: { nombre: NOMBRE, pin: PIN },
} as const;
const INSTALACION = {
  type: 'object',
  required: ['dueno', 'caja'],
  additionalProperties: false,
  properties: {
    dueno: PERSONA,
    caja: {
      type: 'object',
      required: ['nombre'],
      additionalProperties: false,
      properties: { nombre: NOMBRE },
    },
    cajero: PERSONA,
  },
} as const;

function tokenDe(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

/** Hook onRequest (antes de validar el cuerpo): exige sesión y, si se indican, uno de los roles. */
export function requiereSesion(
  sesiones: Sesiones,
  roles?: readonly Rol[],
): onRequestAsyncHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = tokenDe(req);
    const sesion = token ? sesiones.obtener(token) : null;
    if (!sesion) {
      return reply
        .code(401)
        .send({ error: 'SIN_SESION', mensaje: 'Ingresa tu PIN para continuar' });
    }
    if (roles && !roles.includes(sesion.usuario.role)) {
      return reply
        .code(403)
        .send({ error: 'SIN_PERMISO', mensaje: 'Esta acción la puede hacer solo el dueño' });
    }
    req.sesion = sesion;
  };
}

function respuestaBloqueo(reply: FastifyReply, segundos: number) {
  return reply.code(429).send({
    error: 'BLOQUEADO',
    mensaje: `Demasiados intentos. Espera ${segundos} segundos.`,
    segundos,
  });
}

export function registrarAuth(
  app: FastifyInstance,
  { db, sesiones, intentos }: DependenciasAuth,
): void {
  app.decorateRequest('sesion', null);
  const conSesion = requiereSesion(sesiones);
  const soloDueno = requiereSesion(sesiones, ['DUENO']);

  /**
   * Primer arranque: una base recién instalada no tiene dueño. La caja pide estos datos una
   * sola vez y crea el dueño, la caja y, opcionalmente, el cajero. Después queda cerrado.
   */
  app.get('/auth/inicial', () => ({ requiereConfiguracion: contarDuenosActivos(db) === 0 }));

  app.post<{
    Body: {
      dueno: { nombre: string; pin: string };
      caja: { nombre: string };
      cajero?: { nombre: string; pin: string };
    };
  }>('/auth/inicial', { schema: { body: INSTALACION } }, (req, reply) => {
    if (contarDuenosActivos(db) > 0) {
      return reply.code(409).send({
        error: 'YA_CONFIGURADO',
        mensaje: 'La caja ya tiene un dueño; no se puede volver a instalar',
      });
    }
    const { dueno, caja } = req.body;
    const duenoCreado = db.transaction(() => {
      const existeCaja = db.select({ id: registers.id }).from(registers).get();
      if (!existeCaja) {
        db.insert(registers).values({ name: caja.nombre.trim() }).run();
      }
      const creado = crearUsuario(db, {
        name: dueno.nombre,
        role: 'DUENO',
        pin: dueno.pin,
      });
      if (req.body.cajero) {
        crearUsuario(db, {
          name: req.body.cajero.nombre,
          role: 'CAJERO',
          pin: req.body.cajero.pin,
        });
      }
      return creado;
    });
    const sesion = sesiones.crear({
      id: duenoCreado.id,
      name: duenoCreado.name,
      role: duenoCreado.role,
    });
    return reply.code(201).send({ token: sesion.token, usuario: sesion.usuario });
  });

  /** Para la pantalla de PIN: quién puede entrar. No expone PIN ni datos sensibles. */
  app.get('/auth/usuarios', () =>
    listarUsuariosActivos(db).map(({ id, name, role }) => ({ id, name, role })),
  );

  app.post<{ Body: { usuarioId: string; pin: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['usuarioId', 'pin'],
          additionalProperties: false,
          properties: { usuarioId: { type: 'string', minLength: 1 }, pin: PIN },
        },
      },
    },
    (req, reply) => {
      const { usuarioId, pin } = req.body;
      const estado = intentos.estado(usuarioId);
      if (estado.bloqueado) return respuestaBloqueo(reply, estado.segundosRestantes);

      const usuario = autenticar(db, usuarioId, pin);
      if (!usuario) {
        const restantes = intentos.fallo(usuarioId);
        if (restantes === 0) {
          const e = intentos.estado(usuarioId);
          return respuestaBloqueo(reply, e.bloqueado ? e.segundosRestantes : 0);
        }
        return reply.code(401).send({
          error: 'PIN_INCORRECTO',
          mensaje: 'PIN incorrecto',
          intentosRestantes: restantes,
        });
      }
      intentos.exito(usuarioId);
      const sesion = sesiones.crear({ id: usuario.id, name: usuario.name, role: usuario.role });
      return { token: sesion.token, usuario: sesion.usuario };
    },
  );

  app.get('/auth/sesion', { onRequest: conSesion }, (req) => ({ usuario: req.sesion?.usuario }));

  app.post('/auth/logout', { onRequest: conSesion }, (req, reply) => {
    if (req.sesion) sesiones.cerrar(req.sesion.token);
    return reply.code(204).send();
  });

  /**
   * Verifica la clave del dueño para una acción puntual del cajero (ej. anular la última venta).
   * No abre sesión: solo confirma quién autorizó.
   */
  app.post<{ Body: { pin: string } }>(
    '/auth/autorizar',
    {
      onRequest: conSesion,
      schema: {
        body: {
          type: 'object',
          required: ['pin'],
          additionalProperties: false,
          properties: { pin: PIN },
        },
      },
    },
    (req, reply) => {
      const r = autorizarDueno(db, intentos, req.body.pin);
      if (!r.ok) return reply.code(r.estado).send(r.cuerpo);
      return { autorizadoPor: { id: r.dueno.id, name: r.dueno.name } };
    },
  );

  // --- Gestión de usuarios (solo dueño) ---

  app.get('/users', { onRequest: soloDueno }, () => listarUsuarios(db));

  app.post<{ Body: { name: string; role: Rol; pin: string } }>(
    '/users',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'role', 'pin'],
          additionalProperties: false,
          properties: { name: NOMBRE, role: ROL, pin: PIN },
        },
      },
    },
    (req, reply) => reply.code(201).send(crearUsuario(db, req.body)),
  );

  app.patch<{ Params: { id: string }; Body: CambiosUsuario }>(
    '/users/:id',
    {
      onRequest: soloDueno,
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: { name: NOMBRE, role: ROL, pin: PIN, active: { type: 'boolean' } },
        },
      },
    },
    (req, reply) => {
      const antes = buscarUsuario(db, req.params.id);
      const r = editarUsuario(db, req.params.id, req.body);
      if (!r.ok) {
        return r.error === 'NO_ENCONTRADO'
          ? reply.code(404).send({ error: 'NO_ENCONTRADO', mensaje: 'Usuario no encontrado' })
          : reply.code(409).send({
              error: 'ULTIMO_DUENO',
              mensaje: 'Debe quedar al menos un dueño activo',
            });
      }
      // Si cambió algo de su acceso, debe volver a entrar con su PIN.
      const cambioAcceso =
        req.body.pin !== undefined ||
        (req.body.active !== undefined && req.body.active !== antes?.active) ||
        (req.body.role !== undefined && req.body.role !== antes?.role);
      if (cambioAcceso) sesiones.cerrarDeUsuario(r.usuario.id);
      return r.usuario;
    },
  );
}
