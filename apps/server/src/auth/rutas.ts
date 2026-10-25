import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import type { Db } from '../db/client.js';
import { ROLES, type Rol } from '../db/schema.js';
import type { LimitadorIntentos } from './intentos.js';
import type { Sesion, Sesiones } from './sesiones.js';
import {
  autenticar,
  buscarUsuario,
  crearUsuario,
  editarUsuario,
  listarUsuarios,
  listarUsuariosActivos,
  verificarPinDueno,
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

/** Clave del limitador para la clave del dueño (es una sola para todos los dueños). */
const CLAVE_DUENO = 'autorizacion-dueno';

function tokenDe(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

/** preHandler: exige sesión y, si se indican, uno de los roles. */
export function requiereSesion(
  sesiones: Sesiones,
  roles?: readonly Rol[],
): preHandlerAsyncHookHandler {
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

  app.get('/auth/sesion', { preHandler: conSesion }, (req) => ({ usuario: req.sesion?.usuario }));

  app.post('/auth/logout', { preHandler: conSesion }, (req, reply) => {
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
      preHandler: conSesion,
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
      const estado = intentos.estado(CLAVE_DUENO);
      if (estado.bloqueado) return respuestaBloqueo(reply, estado.segundosRestantes);
      const dueno = verificarPinDueno(db, req.body.pin);
      if (!dueno) {
        const restantes = intentos.fallo(CLAVE_DUENO);
        if (restantes === 0) {
          const e = intentos.estado(CLAVE_DUENO);
          return respuestaBloqueo(reply, e.bloqueado ? e.segundosRestantes : 0);
        }
        return reply.code(401).send({
          error: 'PIN_INCORRECTO',
          mensaje: 'Clave del dueño incorrecta',
          intentosRestantes: restantes,
        });
      }
      intentos.exito(CLAVE_DUENO);
      return { autorizadoPor: { id: dueno.id, name: dueno.name } };
    },
  );

  // --- Gestión de usuarios (solo dueño) ---

  app.get('/users', { preHandler: soloDueno }, () => listarUsuarios(db));

  app.post<{ Body: { name: string; role: Rol; pin: string } }>(
    '/users',
    {
      preHandler: soloDueno,
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
      preHandler: soloDueno,
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
