import { vi } from 'vitest';
import {
  ClienteApi,
  type ProductoLocal,
  type RespaldoLocal,
  type Rol,
  type SesionCaja,
} from '../api.js';

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
  /** Cuerpos recibidos en POST /products. */
  creados: Record<string, unknown>[];
  /** Datos extra por producto (costo, stock mínimo, activo). */
  extra: Record<string, { costClp: number | null; stockMinMilli: number | null; active: boolean }>;
  /** Cuerpos recibidos en PATCH /products/:id, POST /products/:id/stock, PUT /quick-buttons y POST /receptions. */
  ediciones: { id: string; cuerpo: Record<string, unknown> }[];
  ajustes: { id: string; cuerpo: Record<string, unknown> }[];
  botonesGuardados: unknown[];
  recepciones: Record<string, unknown>[];
  /** Datos del local (GET/PATCH /settings). */
  local: Record<string, unknown>;
  configGuardada: Record<string, unknown>[];
  respaldos: RespaldoLocal[];
  impresoraCfg: Record<string, unknown>;
  anulaciones: Record<string, unknown>[];
  cierres: Record<string, unknown>[];
  dteProvider: 'MOCK' | 'PUENTE_MANUAL' | 'SII_DIRECTO';
  boletaConfirmada: boolean;
  siiListo: boolean;
  requiereInstalacion: boolean;
  redondeo: boolean;
  /** `true` = hay impresora (imprime); `false` = sin impresora configurada. */
  impresora: boolean;
  /** Ventas recibidas (por id) y cuerpos de cada POST /sales, en orden. */
  ventas: Map<string, Record<string, unknown>>;
  pedidos: Record<string, unknown>[];
  impresiones: { id: string; reimpresion: boolean }[];
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

type LineaFalsa = {
  productoId: string | null;
  cantidadMilli: number;
  nombre?: string;
  unidad?: 'UN' | 'KG';
  precioUnitarioClp?: number;
  montoFijoClp?: number;
};

/** Ley 20.956: 1–5 baja, 6–9 sube. */
const redondear = (total: number) => {
  const u = total % 10;
  return u === 0 ? 0 : u <= 5 ? -u : 10 - u;
};

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
    productos: [...PRODUCTOS_FALSOS],
    creados: [],
    extra: {},
    ediciones: [],
    ajustes: [],
    botonesGuardados: [],
    recepciones: [],
    local: {
      razonSocial: 'Almacén de Prueba',
      rut: null,
      giro: null,
      direccion: null,
      comuna: 'Santiago',
      prefijosBalanzaPrecio: [],
    },
    configGuardada: [],
    respaldos: [],
    boletaConfirmada: true,
    siiListo: false,
    requiereInstalacion: false,
    impresoraCfg: {
      transporte: 'DESACTIVADA',
      destino: null,
      anchoMm: 80,
      columnas: null,
      paginaCodigos: 'CP858',
      cortar: true,
      abrirCajon: true,
    },
    anulaciones: [],
    cierres: [],
    dteProvider: 'MOCK',
    redondeo: true,
    impresora: true,
    ventas: new Map(),
    pedidos: [],
    impresiones: [],
    forzar: {},
    ...inicial,
  };
  let n = 0;

  const cotizar = (lineas: LineaFalsa[]) => {
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
    return {
      totalClp: calculadas.reduce((a, l) => a + l.totalLineaClp, 0),
      descuentoTotalClp: calculadas.reduce((a, l) => a + l.descuentoClp, 0),
      lineas: calculadas,
    };
  };

  const extra = (id: string) =>
    (estado.extra[id] ??= { costClp: null, stockMinMilli: null, active: true });
  const listado = (p: ProductoLocal) => ({ ...p, ...extra(p.id), categoryId: null });
  const detalle = (p: ProductoLocal) => ({
    ...listado(p),
    barcodesAlternativos: [],
    categoria: null,
    margen:
      extra(p.id).costClp === null
        ? null
        : Math.round(((p.priceClp - (extra(p.id).costClp ?? 0)) * 100) / p.priceClp),
    taxType: 'AFECTO',
    scaleCode: null,
    source: 'LOCAL',
  });

  const resumen = () => {
    const ventas = [...estado.ventas.values()] as {
      medioPago: 'EFECTIVO' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA';
      totalCobradoClp: number;
      totalClp: number;
      redondeoClp: number;
      estado: string;
    }[];
    const validas = ventas.filter((v) => v.estado === 'OK');
    const porMedio = Object.fromEntries(
      (['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'] as const).map((m) => {
        const del = validas.filter((v) => v.medioPago === m);
        return [
          m,
          { cantidad: del.length, cobradoClp: del.reduce((a, v) => a + v.totalCobradoClp, 0) },
        ];
      }),
    ) as Record<string, { cantidad: number; cobradoClp: number }>;
    const anuladas = ventas.filter((v) => v.estado === 'ANULADA');
    const inicial = estado.sesionCaja?.efectivoInicialClp ?? 0;
    return {
      porMedio,
      cantidadVentas: validas.length,
      totalVentasClp: validas.reduce((a, v) => a + v.totalClp, 0),
      redondeoClp: validas.reduce((a, v) => a + v.redondeoClp, 0),
      totalCobradoClp: validas.reduce((a, v) => a + v.totalCobradoClp, 0),
      anuladas: {
        cantidad: anuladas.length,
        totalClp: anuladas.reduce((a, v) => a + v.totalClp, 0),
      },
      efectivoInicialClp: inicial,
      efectivoEsperadoClp: inicial + (porMedio['EFECTIVO']?.cobradoClp ?? 0),
    };
  };
  const configuracion = () => ({
    ...estado.local,
    dteProvider: estado.dteProvider,
    boletaConfirmada: estado.boletaConfirmada,
    siiListo: estado.siiListo,
    modoPrueba: estado.dteProvider === 'MOCK',
    modeloEmision: estado.local['modeloEmision'] ?? 'SOLO_NO_ELECTRONICOS',
    cashRoundingEnabled: estado.redondeo,
    modalidadesDisponibles: ['PUENTE_MANUAL', 'MOCK', ...(estado.siiListo ? ['SII_DIRECTO'] : [])],
  });

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
      case 'GET /auth/inicial':
        return json(200, { requiereConfiguracion: estado.requiereInstalacion });
      case 'POST /auth/inicial': {
        if (!estado.requiereInstalacion) {
          return json(409, { error: 'YA_CONFIGURADO', mensaje: 'La caja ya está configurada' });
        }
        const dueno = cuerpo['dueno'] as { nombre?: string; pin?: string } | undefined;
        if (!dueno?.nombre || !dueno.pin) {
          return json(400, { error: 'DATOS_INVALIDOS', mensaje: 'Faltan datos del dueño' });
        }
        const usuario = {
          id: 'u-inst',
          name: dueno.nombre,
          role: 'DUENO' as const,
          pin: dueno.pin,
        };
        estado.usuarios.push(usuario);
        estado.tokens.set('t-inst', usuario);
        estado.requiereInstalacion = false;
        return json(201, {
          token: 't-inst',
          usuario: { id: usuario.id, name: usuario.name, role: usuario.role },
        });
      }
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
        return json(200, {
          caja: { id: 'c1', name: 'Caja 1' },
          sesion: estado.sesionCaja,
          resumen: estado.sesionCaja ? resumen() : null,
        });
      case 'POST /cash/close': {
        if (!usuario) return sinSesion();
        if (!estado.sesionCaja)
          return json(409, { error: 'CAJA_CERRADA', mensaje: 'La caja no está abierta' });
        estado.cierres.push(cuerpo);
        const r = resumen();
        const contado = Number(cuerpo['efectivoContadoClp']);
        const sesion = {
          ...estado.sesionCaja,
          cerradaPor: { id: usuario.id, name: usuario.name },
          cerradaEn: '2026-10-25T23:00:00.000Z',
          efectivoContadoClp: contado,
          efectivoEsperadoClp: r.efectivoEsperadoClp,
          diferenciaClp: contado - r.efectivoEsperadoClp,
        };
        estado.sesionCaja = null;
        return json(200, { caja: { id: 'c1', name: 'Caja 1' }, sesion, resumen: r });
      }
      case 'GET /sales/last': {
        if (!usuario) return sinSesion();
        const ventas = [...estado.ventas.values()];
        const ultima = ventas.at(-1);
        if (!ultima)
          return json(404, { error: 'SIN_VENTAS', mensaje: 'No hay ventas en este turno' });
        return json(200, {
          ...ultima,
          creadaEn: '2026-10-25T12:00:00.000Z',
          cajero: { name: 'Cajero' },
        });
      }
      case 'GET /about':
        return json(200, {
          app: 'Almacén POS',
          version: '0.1.0',
          developer: { name: 'Arrayan Labs', email: 'arrayan.labs@gmail.com' },
          license: 'ODbL-1.0',
          license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
          attribution:
            'Datos de productos de Open Food Facts (https://openfoodfacts.org) y proyectos asociados.',
          sources: [
            {
              id: 'off',
              nombre: 'Open Food Facts',
              url: 'https://static.openfoodfacts.org/data/x.csv.gz',
              export_del: '2026-10-25',
            },
          ],
          built_at: '2026-10-25T11:35:19.120Z',
          product_count: 11027,
        });
      case 'GET /setup': {
        if (!usuario) return sinSesion();
        const faltan: string[] = [];
        if (!estado.local['rut']) faltan.push('RUT');
        if (!estado.local['razonSocial']) faltan.push('razón social');
        if (!estado.local['giro']) faltan.push('giro');
        if (!estado.local['direccion']) faltan.push('dirección');
        if (!estado.local['comuna']) faltan.push('comuna');
        return json(200, {
          local: { completo: faltan.length === 0, faltan },
          boleta: {
            confirmada: estado.boletaConfirmada,
            modalidad: estado.dteProvider,
            siiListo: estado.siiListo,
          },
          impresora: {
            configurada: estado.impresoraCfg['transporte'] !== 'DESACTIVADA',
            transporte: estado.impresoraCfg['transporte'],
            destino: estado.impresoraCfg['destino'] ?? null,
          },
          vinculacion: {
            installationId: 'inst-1',
            deviceToken: 'tok-1',
            caja: 'Caja 1',
          },
        });
      }
      case 'GET /backups/clave':
        if (!usuario) return sinSesion();
        return json(200, { clave: 'clave-de-prueba' });
      case 'POST /backups/probar-nube':
        if (!usuario) return sinSesion();
        return json(200, { ok: true, status: 200, version: '0.1.0' });
      case 'GET /backups':
        if (!usuario) return sinSesion();
        if (usuario.role !== 'DUENO') {
          return json(403, {
            error: 'SIN_PERMISO',
            mensaje: 'Solo el dueño puede ver los respaldos',
          });
        }
        return json(200, { respaldos: estado.respaldos });
      case 'POST /backups': {
        if (!usuario) return sinSesion();
        if (usuario.role !== 'DUENO') {
          return json(403, { error: 'SIN_PERMISO', mensaje: 'Solo el dueño puede respaldar' });
        }
        const nuevo: RespaldoLocal = {
          nombre: `almacen-2026-10-25_23-10-0${estado.respaldos.length}`,
          creadoEn: new Date('2026-10-25T23:10:00-03:00').toISOString(),
          tamanoBytes: 1024 * 1024,
          incluyeClaveSii: false,
          nube: null,
        };
        estado.respaldos.unshift(nuevo);
        return json(200, nuevo);
      }
      case 'PATCH /settings':
        if (!usuario) return sinSesion();
        estado.configGuardada.push(cuerpo);
        if (cuerpo['rut'] === '1-1')
          return json(400, { error: 'RUT_INVALIDO', mensaje: 'El RUT no es válido' });
        estado.local = { ...estado.local, ...cuerpo };
        if (cuerpo['dteProvider']) {
          estado.dteProvider = cuerpo['dteProvider'] as 'MOCK' | 'PUENTE_MANUAL' | 'SII_DIRECTO';
          estado.boletaConfirmada = true;
        }
        if (typeof cuerpo['cashRoundingEnabled'] === 'boolean')
          estado.redondeo = cuerpo['cashRoundingEnabled'];
        return json(200, configuracion());
      case 'GET /printer':
        if (!usuario) return sinSesion();
        return json(200, {
          caja: { id: 'c1', name: 'Caja 1' },
          ...estado.impresoraCfg,
          columnasEfectivas: 48,
        });
      case 'PUT /printer':
        if (!usuario) return sinSesion();
        if (cuerpo['transporte'] === 'RED' && !cuerpo['destino']) {
          return json(400, {
            error: 'CONFIG_IMPRESORA_INVALIDA',
            mensaje: 'Falta la dirección IP de la impresora',
          });
        }
        estado.impresoraCfg = cuerpo;
        return json(200, {
          caja: { id: 'c1', name: 'Caja 1' },
          ...cuerpo,
          columnasEfectivas: cuerpo['anchoMm'] === 58 ? 32 : 48,
        });
      case 'GET /printer/system-queues':
        return json(200, { colas: ['EPSON_TM_T20', 'XP-58'] });
      case 'POST /printer/test':
        return json(200, {
          impreso: estado.impresoraCfg['transporte'] !== 'DESACTIVADA',
          vistaPrevia: 'P R U E B A   D E   I M P R E S I Ó N',
          motivo: estado.impresoraCfg['transporte'] !== 'DESACTIVADA' ? null : 'SIN_IMPRESORA',
        });
      case 'POST /printer/drawer':
        return json(200, { abierto: estado.impresoraCfg['transporte'] !== 'DESACTIVADA' });
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
        return json(200, cotizar((cuerpo['lineas'] ?? []) as LineaFalsa[]));
      }
      case 'POST /products': {
        if (!usuario) return sinSesion();
        estado.creados.push(cuerpo);
        const barcode = (cuerpo['barcode'] as string | null) ?? null;
        if (barcode && estado.productos.some((p) => p.barcode === barcode)) {
          return json(409, {
            error: 'CODIGO_EXISTE',
            mensaje: 'Ese código ya está registrado en otro producto',
          });
        }
        const nuevo = producto(
          `n${estado.productos.length + 1}`,
          String(cuerpo['name']).trim(),
          cuerpo['unit'] as 'UN' | 'KG',
          Number(cuerpo['priceClp']),
          Number(cuerpo['stockInicialMilli'] ?? 0),
          barcode,
        );
        estado.productos.push(nuevo);
        return json(201, nuevo);
      }
      case 'GET /settings':
        if (!usuario) return sinSesion();
        return json(200, configuracion());
      case 'POST /sales': {
        if (!usuario) return sinSesion();
        estado.pedidos.push(cuerpo);
        const id = String(cuerpo['id']);
        const previa = estado.ventas.get(id);
        if (previa) return json(200, previa);
        const q = cotizar((cuerpo['lineas'] ?? []) as LineaFalsa[]);
        if (cuerpo['totalEsperadoClp'] !== undefined && cuerpo['totalEsperadoClp'] !== q.totalClp) {
          return json(409, {
            error: 'TOTAL_CAMBIO',
            mensaje: 'Los precios cambiaron',
            totalClp: q.totalClp,
          });
        }
        const medio = String(cuerpo['medioPago']);
        const r = medio === 'EFECTIVO' && estado.redondeo ? redondear(q.totalClp) : 0;
        const aPagar = q.totalClp + r;
        const pagado = medio === 'EFECTIVO' ? Number(cuerpo['pagadoClp'] ?? aPagar) : aPagar;
        if (pagado < aPagar)
          return json(400, {
            error: 'PAGO_INSUFICIENTE',
            mensaje: 'El monto pagado es menor al total',
          });
        const conDocumento = medio === 'EFECTIVO' || medio === 'TRANSFERENCIA';
        const venta = {
          id,
          numero: estado.ventas.size + 1,
          estado: 'OK',
          medioPago: medio,
          totalClp: q.totalClp,
          redondeoClp: r,
          totalCobradoClp: aPagar,
          pagadoClp: pagado,
          vueltoClp: pagado - aPagar,
          documento: conDocumento
            ? {
                provider: estado.dteProvider,
                folioExterno: null,
                validoComoBoleta: false,
                leyendas: ['COMPROBANTE DE VENTA – NO VÁLIDO COMO BOLETA'],
                accionCajero:
                  estado.dteProvider === 'PUENTE_MANUAL'
                    ? `Emite la boleta en la app e-Boleta del SII por $${aPagar.toLocaleString('es-CL')}`
                    : null,
              }
            : null,
          motivoSinDocumento: conDocumento ? null : 'VOUCHER_ES_BOLETA',
        };
        estado.ventas.set(id, venta);
        return json(201, venta);
      }
      case 'PUT /quick-buttons':
        if (!usuario) return sinSesion();
        estado.botonesGuardados.push(cuerpo['botones']);
        return json(200, []);
      case 'POST /receptions': {
        if (!usuario) return sinSesion();
        estado.recepciones.push(cuerpo);
        const lineas = cuerpo['lineas'] as {
          productoId: string;
          cantidadMilli: number;
          costoUnitarioClp?: number;
        }[];
        return json(201, {
          id: 'r1',
          lineas: lineas.map((l) => {
            const p = estado.productos.find((x) => x.id === l.productoId);
            const antes = p?.stockQtyMilli ?? 0;
            if (p) p.stockQtyMilli = antes + l.cantidadMilli;
            const costoAntes = extra(l.productoId).costClp;
            if (l.costoUnitarioClp !== undefined) extra(l.productoId).costClp = l.costoUnitarioClp;
            return {
              productoId: l.productoId,
              nombre: p?.name ?? '?',
              cantidadMilli: l.cantidadMilli,
              stockAnteriorMilli: antes,
              stockNuevoMilli: antes + l.cantidadMilli,
              costoAnteriorClp: costoAntes,
              costoNuevoClp: extra(l.productoId).costClp,
            };
          }),
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
        const imprimir = /^POST \/sales\/(.+)\/print$/.exec(clave);
        if (imprimir) {
          if (!usuario) return sinSesion();
          estado.impresiones.push({
            id: imprimir[1] ?? '',
            reimpresion: cuerpo['reimpresion'] === true,
          });
          return json(200, {
            impreso: estado.impresora,
            vistaPrevia: 'COMPROBANTE DE VENTA - NO VÁLIDO COMO BOLETA',
            motivo: estado.impresora ? null : 'SIN_IMPRESORA',
          });
        }
        const anular = /^POST \/sales\/(.+)\/void$/.exec(clave);
        if (anular) {
          if (!usuario) return sinSesion();
          estado.anulaciones.push(cuerpo);
          if (usuario.role !== 'DUENO' && cuerpo['pinDueno'] !== '1234') {
            return json(401, {
              error: 'PIN_INCORRECTO',
              mensaje: 'Clave del dueño incorrecta',
              intentosRestantes: 4,
            });
          }
          const v = estado.ventas.get(anular[1] ?? '');
          if (!v) return json(404, { error: 'NO_ENCONTRADO', mensaje: 'Venta no encontrada' });
          v['estado'] = 'ANULADA';
          return json(200, {
            venta: v,
            recordatorio:
              v['medioPago'] === 'DEBITO'
                ? `Anula también el pago en la máquina de tarjetas`
                : null,
          });
        }
        const imprimirCierre = /^POST \/cash\/sessions\/(.+)\/print$/.exec(clave);
        if (imprimirCierre) {
          return json(200, {
            impreso: estado.impresora,
            vistaPrevia: 'CIERRE DE CAJA',
            motivo: estado.impresora ? null : 'SIN_IMPRESORA',
          });
        }
        const folio = /^PATCH \/sales\/(.+)\/folio-sii$/.exec(clave);
        if (folio) {
          if (!usuario) return sinSesion();
          const v = estado.ventas.get(folio[1] ?? '') as
            { documento: Record<string, unknown> } | undefined;
          if (!v) return json(404, { error: 'NO_ENCONTRADO', mensaje: 'Venta no encontrada' });
          if (!/^\d+$/.test(String(cuerpo['folio'])) || Number(cuerpo['folio']) === 0) {
            return json(400, {
              error: 'FOLIO_INVALIDO',
              mensaje: 'El folio debe ser un número mayor a 0',
            });
          }
          v.documento = {
            ...v.documento,
            folioExterno: String(Number(cuerpo['folio'])),
            accionCajero: null,
          };
          return json(200, v);
        }
        const busqueda = /^GET \/products\?(.*)$/.exec(clave);
        if (busqueda) {
          if (!usuario) return sinSesion();
          const params = new URLSearchParams(busqueda[1] ?? '');
          const q = (params.get('buscar') ?? '').toLowerCase().trim();
          const filtro = params.get('filtro');
          if (q === '' && !filtro) return json(200, []);
          return json(
            200,
            estado.productos
              .map(listado)
              .filter((p) => p.name.toLowerCase().includes(q))
              .filter((p) => (filtro === 'INACTIVOS' ? !p.active : p.active))
              .filter(
                (p) =>
                  filtro !== 'STOCK_BAJO' ||
                  p.stockQtyMilli <= 0 ||
                  (p.stockMinMilli !== null && p.stockQtyMilli <= p.stockMinMilli),
              )
              .filter((p) => filtro !== 'SIN_STOCK' || p.stockQtyMilli <= 0),
          );
        }
        const stock = /^POST \/products\/([^/]+)\/stock$/.exec(clave);
        if (stock) {
          if (!usuario) return sinSesion();
          const p = estado.productos.find((x) => x.id === stock[1]);
          if (!p) return json(404, { error: 'NO_ENCONTRADO', mensaje: 'Producto no encontrado' });
          estado.ajustes.push({ id: p.id, cuerpo });
          p.stockQtyMilli =
            cuerpo['tipo'] === 'CONTEO'
              ? Number(cuerpo['stockContadoMilli'])
              : p.stockQtyMilli - Number(cuerpo['cantidadMilli']);
          return json(200, detalle(p));
        }
        const producto = /^(GET|PATCH) \/products\/([^/]+)$/.exec(clave);
        if (producto && producto[2] !== 'lookup') {
          if (!usuario) return sinSesion();
          const p = estado.productos.find((x) => x.id === producto[2]);
          if (!p) return json(404, { error: 'NO_ENCONTRADO', mensaje: 'Producto no encontrado' });
          if (producto[1] === 'PATCH') {
            estado.ediciones.push({ id: p.id, cuerpo });
            if (cuerpo['priceClp'] !== undefined) p.priceClp = Number(cuerpo['priceClp']);
            if (typeof cuerpo['name'] === 'string') p.name = cuerpo['name'];
            if (cuerpo['costClp'] !== undefined)
              extra(p.id).costClp = cuerpo['costClp'] as number | null;
            if (cuerpo['stockMinMilli'] !== undefined)
              extra(p.id).stockMinMilli = cuerpo['stockMinMilli'] as number | null;
            if (cuerpo['active'] !== undefined) extra(p.id).active = cuerpo['active'] as boolean;
          }
          return json(200, detalle(p));
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
          if (codigo === '7809' && !estado.productos.some((x) => x.barcode === '7809'))
            return json(200, {
              origen: 'SEMILLA',
              producto: {
                barcode: '7809',
                name: 'Té verde',
                brand: 'Marca T',
                format: '20 bolsitas',
                categorySlug: 'te',
                seedRef: '7809',
              },
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
