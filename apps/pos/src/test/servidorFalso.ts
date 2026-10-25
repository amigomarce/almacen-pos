import { vi } from 'vitest';
import { ClienteApi, type ProductoLocal, type Rol, type SesionCaja } from '../api.js';

const producto = (
  id: string,
  name: string,
  unit: 'UN' | 'KG',
  priceClp: number,
  stockQtyMilli: number,
  barcode: string | null,
): ProductoLocal => ({
  id,
  barcode,
  name,
  brand: null,
  format: null,
  unit,
  priceClp,
  stockQtyMilli,
});

export const PRODUCTOS_FALSOS: ProductoLocal[] = [
  producto('p1', 'Bebida cola 1,5 L', 'UN', 1890, 24000, '7801'),
  producto('p2', 'Tomate', 'KG', 1490, 8500, null),
  producto('p3', 'Queso laminado', 'KG', 11990, 3250, null),
  producto('p4', 'Galletas de vino', 'UN', 890, 30000, '78040000'),
  producto('p5', 'Leche entera 1 L', 'UN', 1190, 1000, '7805'),
  producto('p6', 'Harina a granel', 'KG', 1200, 20000, '7806'),
  producto('p7', 'Pan corriente', 'KG', 1990, 0, null),
];

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
  productos: ProductoLocal[];
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
    productos: PRODUCTOS_FALSOS,
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
      case 'POST /sales/quote': {
        if (!usuario) return sinSesion();
        type L = {
          productoId: string | null;
          cantidadMilli: number;
          nombre?: string;
          unidad?: 'UN' | 'KG';
          precioUnitarioClp?: number;
          montoFijoClp?: number;
        };
        const lineas = (cuerpo['lineas'] ?? []) as L[];
        const calculadas = lineas.map((l) => {
          const p = estado.productos.find((x) => x.id === l.productoId);
          const precio = p?.priceClp ?? l.precioUnitarioClp ?? 0;
          const cantidad =
            l.montoFijoClp !== undefined
              ? Math.max(1, Math.round((l.montoFijoClp * 1000) / precio))
              : l.cantidadMilli;
          const subtotal = l.montoFijoClp ?? Math.round((cantidad * precio) / 1000);
          // Promoción falsa: galletas 2 × $1.500.
          const packs = p?.id === 'p4' ? Math.floor(cantidad / 2000) : 0;
          const descuento = packs * (2 * 890 - 1500);
          return {
            productoId: l.productoId,
            nombre: p?.name ?? l.nombre ?? '?',
            unidad: p?.unit ?? l.unidad ?? 'UN',
            cantidadMilli: cantidad,
            precioUnitarioClp: precio,
            descuentoClp: descuento,
            totalLineaClp: subtotal - descuento,
          };
        });
        return json(200, {
          totalClp: calculadas.reduce((a, l) => a + l.totalLineaClp, 0),
          descuentoTotalClp: calculadas.reduce((a, l) => a + l.descuentoClp, 0),
          lineas: calculadas,
        });
      }
      case 'GET /quick-buttons': {
        if (!usuario) return sinSesion();
        const p = (id: string) => estado.productos.find((x) => x.id === id) ?? null;
        return json(200, [
          {
            id: 'b1',
            label: 'Pan',
            posicion: 1,
            producto: p('p7'),
          },
          { id: 'b2', label: 'Leche', posicion: 2, producto: p('p5') },
          { id: 'b3', label: 'Bolsa', posicion: 3, producto: null },
        ]);
      }
      default: {
        const busqueda = /^GET \/products\?buscar=(.*)$/.exec(clave);
        if (busqueda) {
          if (!usuario) return sinSesion();
          const q = decodeURIComponent(busqueda[1] ?? '').toLowerCase();
          return json(
            200,
            estado.productos.filter((p) => p.name.toLowerCase().includes(q)),
          );
        }
        const lookup = /^GET \/products\/lookup\/(.+)$/.exec(clave);
        if (lookup) {
          const codigo = decodeURIComponent(lookup[1] ?? '');
          const queso = estado.productos.find((p) => p.id === 'p3');
          if (codigo === '2501234002500')
            return json(200, {
              origen: 'LOCAL',
              producto: queso,
              balanza: { codigoProducto: '01234', tipo: 'PESO', pesoGramos: 250 },
            });
          if (codigo === '2601234012000')
            return json(200, {
              origen: 'LOCAL',
              producto: queso,
              balanza: { codigoProducto: '01234', tipo: 'PRECIO', precioClp: 1200 },
            });
          if (codigo === '2509999002500')
            return json(200, {
              origen: 'LOCAL',
              producto: estado.productos[0],
              balanza: { codigoProducto: '09999', tipo: 'PESO', pesoGramos: 250 },
            });
          if (codigo === '7809')
            return json(200, {
              origen: 'SEMILLA',
              producto: { barcode: '7809', name: 'Té verde', brand: null, format: null },
            });
          if (codigo === '0000')
            return json(400, {
              error: 'CODIGO_INVALIDO',
              mensaje: 'El código de barras no es válido',
            });
          const p = estado.productos.find((x) => x.barcode === codigo);
          return json(
            200,
            p ? { origen: 'LOCAL', producto: p } : { origen: 'NO_ENCONTRADO', producto: null },
          );
        }
        return json(404, { error: 'NO_ENCONTRADO', mensaje: `Ruta falsa no definida: ${clave}` });
      }
    }
  });

  return { estado, fetchFn, api: new ClienteApi('/api', fetchFn) };
}

/** Servidor falso con una sesión de cajero ya abierta (para probar pantallas internas). */
export function servidorConSesion(inicial: Partial<EstadoFalso> = {}) {
  const s = servidorFalso(inicial);
  const cajero = s.estado.usuarios.find((u) => u.role === 'CAJERO');
  if (cajero) s.estado.tokens.set('t-prueba', cajero);
  s.api.usarToken('t-prueba');
  return s;
}
