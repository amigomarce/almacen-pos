import { vi } from 'vitest';
import { ClienteApi, type Rol, type SesionCaja } from '../api.js';

interface UsuarioFalso {
  id: string;
  name: string;
  role: Rol;
  pin: string;
}

export interface EstadoFalso {
  modoPrueba: boolean;
  usuarios: UsuarioFalso[];
  tokens: Map<string, UsuarioFalso>;
  fallos: Map<string, number>;
  sesionCaja: SesionCaja | null;
  /** Respuestas forzadas por "MÉTODO /ruta" (sin /api). */
  forzar: Record<string, { status: number; body: unknown }>;
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

/** Imita lo justo de apps/server para probar las pantallas sin red. */
export function servidorFalso(inicial: Partial<EstadoFalso> = {}) {
  const estado: EstadoFalso = {
    modoPrueba: false,
    usuarios: [
      { id: 'u1', name: 'Dueño', role: 'DUENO', pin: '1234' },
      { id: 'u2', name: 'Cajero', role: 'CAJERO', pin: '0000' },
    ],
    tokens: new Map(),
    fallos: new Map(),
    sesionCaja: null,
    forzar: {},
    ...inicial,
  };
  let n = 0;

  const fetchFn = vi.fn<typeof fetch>((entrada, init) => {
    const url =
      typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const ruta = url.replace(/^\/api/, '');
    const metodo = init?.method ?? 'GET';
    const clave = `${metodo} ${ruta}`;
    const forzada = estado.forzar[clave];
    if (forzada) return json(forzada.status, forzada.body);
    const cuerpo = (typeof init?.body === 'string' ? JSON.parse(init.body) : {}) as Record<
      string,
      unknown
    >;
    const auth = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '';
    const usuario = estado.tokens.get(auth);
    const sinSesion = () =>
      json(401, { error: 'SIN_SESION', mensaje: 'Ingresa tu PIN para continuar' });

    switch (clave) {
      case 'GET /health':
        return json(200, {
          status: 'ok',
          version: '0.1.0',
          db: 'ok',
          semilla: true,
          hora: '2026-10-25T12:00:00.000Z',
          modalidadBoleta: estado.modoPrueba ? 'MOCK' : 'PUENTE_MANUAL',
          modoPrueba: estado.modoPrueba,
        });
      case 'GET /auth/usuarios':
        return json(
          200,
          estado.usuarios.map(({ id, name, role }) => ({ id, name, role })),
        );
      case 'POST /auth/login': {
        const u = estado.usuarios.find((x) => x.id === cuerpo['usuarioId']);
        if (!u || u.pin !== cuerpo['pin']) {
          const f = (estado.fallos.get(String(cuerpo['usuarioId'])) ?? 0) + 1;
          estado.fallos.set(String(cuerpo['usuarioId']), f);
          if (f >= 5)
            return json(429, {
              error: 'BLOQUEADO',
              mensaje: 'Demasiados intentos. Espera 60 segundos.',
              segundos: 60,
            });
          return json(401, {
            error: 'PIN_INCORRECTO',
            mensaje: 'PIN incorrecto',
            intentosRestantes: 5 - f,
          });
        }
        const token = `t${++n}`;
        estado.tokens.set(token, u);
        return json(200, { token, usuario: { id: u.id, name: u.name, role: u.role } });
      }
      case 'GET /auth/sesion':
        return usuario
          ? json(200, { usuario: { id: usuario.id, name: usuario.name, role: usuario.role } })
          : sinSesion();
      case 'POST /auth/logout':
        if (!usuario) return sinSesion();
        estado.tokens.delete(auth);
        return json(204, undefined);
      case 'GET /cash/current':
        if (!usuario) return sinSesion();
        return json(200, { caja: { id: 'c1', name: 'Caja 1' }, sesion: estado.sesionCaja });
      case 'POST /cash/open': {
        if (!usuario) return sinSesion();
        if (estado.sesionCaja)
          return json(409, { error: 'CAJA_ABIERTA', mensaje: 'La caja ya está abierta' });
        estado.sesionCaja = {
          id: 's1',
          abiertaPor: { id: usuario.id, name: usuario.name },
          abiertaEn: '2026-10-25T12:00:00.000Z',
          efectivoInicialClp: Number(cuerpo['efectivoInicialClp']),
        };
        return json(201, { caja: { id: 'c1', name: 'Caja 1' }, sesion: estado.sesionCaja });
      }
      default:
        return json(404, { error: 'NO_ENCONTRADO', mensaje: `Ruta falsa no definida: ${clave}` });
    }
  });

  return { estado, fetchFn, api: new ClienteApi('/api', fetchFn) };
}
