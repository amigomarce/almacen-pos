import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CMD } from '@almacen/printer';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app.js';
import { LimitadorIntentos } from '../auth/intentos.js';
import { Sesiones } from '../auth/sesiones.js';
import * as t from '../db/schema.js';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';
import { ServicioImpresion } from './servicio.js';
import { ErrorImpresion, type Ejecutar, type Transporte } from './transportes.js';

/** Transporte falso que guarda lo enviado. */
class Falso implements Transporte {
  enviados: Uint8Array[] = [];
  falla: string | null = null;
  enviar(bytes: Uint8Array): Promise<void> {
    if (this.falla) return Promise.reject(new ErrorImpresion(this.falla));
    this.enviados.push(bytes);
    return Promise.resolve();
  }
}

let c: CtxPrueba;
let falso: Falso;
let cajero: { authorization: string };
let dueno: { authorization: string };
const ejecutar = vi.fn<Ejecutar>().mockResolvedValue({ codigo: 0, stdout: 'EPSON\n', stderr: '' });

const incluye = (b: Uint8Array, parte: readonly number[]) =>
  Buffer.from(b).includes(Buffer.from(parte));

beforeEach(async () => {
  const base = prepararApp();
  falso = new Falso();
  // Transporte falso salvo DESACTIVADA (así se prueba también el caso sin impresora).
  const impresion = new ServicioImpresion((cfg) =>
    cfg.transporte === 'DESACTIVADA' ? null : falso,
  );
  const app = crearApp({
    db: base.db,
    sesiones: new Sesiones(() => base.reloj.t),
    intentos: new LimitadorIntentos(() => base.reloj.t),
    impresion,
    ejecutar,
  });
  c = { ...base, app };
  cajero = await entrarComo(c, c.cajeroId, '0000');
  dueno = await entrarComo(c, c.duenoId, '1234');
});

const configurar = (cuerpo: object, headers = dueno) =>
  c.app.inject({
    method: 'PUT',
    url: '/printer',
    headers,
    payload: {
      transporte: 'RED',
      destino: '192.168.1.50',
      anchoMm: 58,
      paginaCodigos: 'CP858',
      cortar: true,
      abrirCajon: true,
      ...cuerpo,
    },
  });

describe('configuración de impresora', () => {
  it('parte desactivada, en 80 mm', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/printer', headers: cajero });
    expect(res.json()).toMatchObject({
      caja: { name: 'Caja 1' },
      transporte: 'DESACTIVADA',
      destino: null,
      anchoMm: 80,
      columnas: null,
      columnasEfectivas: 48,
      paginaCodigos: 'CP858',
      cortar: true,
      abrirCajon: true,
    });
  });

  it('el dueño la configura; el cajero no', async () => {
    expect((await configurar({}, cajero)).statusCode).toBe(403);
    const res = await configurar({ destino: ' 192.168.1.50:9100 ', columnas: 30 });
    expect(res.json()).toMatchObject({
      transporte: 'RED',
      destino: '192.168.1.50:9100',
      anchoMm: 58,
      columnasEfectivas: 30,
    });
    const otra = await configurar({ anchoMm: 80, columnas: null });
    expect(otra.json()).toMatchObject({ columnasEfectivas: 48 });
  });

  it.each([
    [{ destino: null }, 'Falta la dirección IP de la impresora'],
    [{ destino: 'http://x' }, 'La dirección debe ser como 192.168.1.50 o 192.168.1.50:9100'],
    [{ transporte: 'SISTEMA', destino: '' }, 'Falta elegir la impresora del sistema'],
    [{ transporte: 'ARCHIVO', destino: ' ' }, 'Falta la carpeta o el dispositivo'],
  ])('valida %j', async (cuerpo, mensaje) => {
    const res = await configurar(cuerpo);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'CONFIG_IMPRESORA_INVALIDA', mensaje });
  });

  it.each([{ anchoMm: 76 }, { columnas: 10 }, { paginaCodigos: 'UTF8' }, { transporte: 'USB' }])(
    'rechaza %j',
    async (cuerpo) => {
      expect((await configurar(cuerpo)).statusCode).toBe(400);
    },
  );

  it('lista las impresoras instaladas en el equipo', async () => {
    const res = await c.app.inject({
      method: 'GET',
      url: '/printer/system-queues',
      headers: dueno,
    });
    expect(res.json()).toEqual({ colas: ['EPSON'] });
  });
});

describe('imprimir prueba', () => {
  it('sin impresora devuelve la vista previa', async () => {
    const res = await c.app.inject({ method: 'POST', url: '/printer/test', headers: cajero });
    expect(res.statusCode).toBe(200);
    const r = res.json<{ impreso: boolean; motivo: string; vistaPrevia: string }>();
    expect(r).toMatchObject({ impreso: false, motivo: 'SIN_IMPRESORA' });
    expect(r.vistaPrevia).toContain('80 mm');
    expect(falso.enviados).toHaveLength(0);
  });

  it('con impresora envía ESC/POS con la página de códigos configurada', async () => {
    await configurar({ paginaCodigos: 'WPC1252', abrirCajon: true });
    const res = await c.app.inject({
      method: 'POST',
      url: '/printer/test',
      headers: cajero,
      payload: { abrirCajon: true },
    });
    expect(res.json()).toMatchObject({ impreso: true, motivo: null });
    const b = falso.enviados[0] ?? new Uint8Array();
    expect(Array.from(b.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]);
    expect(incluye(b, CMD.abrirCajon)).toBe(true);
    expect(incluye(b, CMD.cortar)).toBe(true);
  });

  it('sin corte si la impresora no tiene cuchilla', async () => {
    await configurar({ cortar: false });
    await c.app.inject({ method: 'POST', url: '/printer/test', headers: cajero });
    expect(incluye(falso.enviados[0] ?? new Uint8Array(), CMD.cortar)).toBe(false);
  });

  it('si la impresora falla responde 503 con la vista previa', async () => {
    await configurar({});
    falso.falla = 'La impresora 192.168.1.50:9100 no responde';
    const res = await c.app.inject({ method: 'POST', url: '/printer/test', headers: cajero });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      error: 'IMPRESORA_NO_RESPONDE',
      mensaje:
        'La impresora 192.168.1.50:9100 no responde. Revisa que esté encendida, conectada y con papel.',
    });
    expect(res.json<{ vistaPrevia: string }>().vistaPrevia).toContain('P R U E B A');
  });

  it('con la conexión ARCHIVO real deja el ticket en la carpeta', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'almacen-tickets-'));
    const app = crearApp({ db: c.db });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { usuarioId: c.duenoId, pin: '1234' },
    });
    const headers = { authorization: `Bearer ${login.json<{ token: string }>().token}` };
    await app.inject({
      method: 'PUT',
      url: '/printer',
      headers,
      payload: {
        transporte: 'ARCHIVO',
        destino: dir,
        anchoMm: 80,
        paginaCodigos: 'CP858',
        cortar: true,
        abrirCajon: false,
      },
    });
    const res = await app.inject({ method: 'POST', url: '/printer/test', headers });
    expect(res.json()).toMatchObject({ impreso: true });
    expect(readdirSync(dir)).toHaveLength(1);
  });
});

describe('imprimir venta y cierre', () => {
  const abrirCaja = () =>
    c.app.inject({
      method: 'POST',
      url: '/cash/open',
      headers: cajero,
      payload: { efectivoInicialClp: 0 },
    });
  const vender = async (medioPago = 'EFECTIVO') => {
    const id = c.db
      .select()
      .from(t.products)
      .where(eq(t.products.name, 'Bebida cola 1,5 L'))
      .get()?.id;
    const res = await c.app.inject({
      method: 'POST',
      url: '/sales',
      headers: cajero,
      payload: {
        id: randomUUID(),
        medioPago,
        lineas: [{ productoId: id, cantidadMilli: 1000 }],
        pagadoClp: medioPago === 'EFECTIVO' ? 2000 : undefined,
      },
    });
    if (res.statusCode >= 300) throw new Error(res.body);
    return res.json<{ id: string }>().id;
  };

  it('imprime el comprobante y abre el cajón en efectivo; la reimpresión no lo abre', async () => {
    await configurar({});
    await abrirCaja();
    const id = await vender();
    const r1 = await c.app.inject({ method: 'POST', url: `/sales/${id}/print`, headers: cajero });
    expect(r1.json<{ vistaPrevia: string }>().vistaPrevia).toContain('NO VÁLIDO');
    expect(incluye(falso.enviados[0] ?? new Uint8Array(), CMD.abrirCajon)).toBe(true);

    const r2 = await c.app.inject({
      method: 'POST',
      url: `/sales/${id}/print`,
      headers: cajero,
      payload: { reimpresion: true },
    });
    expect(r2.json<{ vistaPrevia: string }>().vistaPrevia).toContain('REIMPRESIÓN');
    expect(incluye(falso.enviados[1] ?? new Uint8Array(), CMD.abrirCajon)).toBe(false);
  });

  it('no abre el cajón con tarjeta ni si está desactivado', async () => {
    await configurar({ abrirCajon: false });
    await abrirCaja();
    const id = await vender();
    await c.app.inject({ method: 'POST', url: `/sales/${id}/print`, headers: cajero });
    expect(incluye(falso.enviados[0] ?? new Uint8Array(), CMD.abrirCajon)).toBe(false);
    await configurar({});
    const tarjeta = await vender('DEBITO');
    const r = await c.app.inject({
      method: 'POST',
      url: `/sales/${tarjeta}/print`,
      headers: cajero,
    });
    expect(r.json<{ vistaPrevia: string }>().vistaPrevia).toContain('voucher');
    expect(incluye(falso.enviados[1] ?? new Uint8Array(), CMD.abrirCajon)).toBe(false);
  });

  it('venta inexistente → 404', async () => {
    const res = await c.app.inject({ method: 'POST', url: '/sales/x/print', headers: cajero });
    expect(res.statusCode).toBe(404);
  });

  it('el cierre se imprime solo con la caja cerrada', async () => {
    const sesion = (await abrirCaja()).json<{ sesion: { id: string } }>().sesion.id;
    await vender();
    const abierta = await c.app.inject({
      method: 'POST',
      url: `/cash/sessions/${sesion}/print`,
      headers: cajero,
    });
    expect(abierta.statusCode).toBe(409);
    await c.app.inject({
      method: 'POST',
      url: '/cash/close',
      headers: cajero,
      payload: { efectivoContadoClp: 1900 },
    });
    const res = await c.app.inject({
      method: 'POST',
      url: `/cash/sessions/${sesion}/print`,
      headers: cajero,
    });
    const texto = res.json<{ vistaPrevia: string }>().vistaPrevia;
    expect(texto).toContain('C I E R R E');
    expect(texto).toMatch(/= Esperado en caja\s+\$1\.890/);
    expect(texto).toContain('S O B R A N   $ 1 0');
    const nada = await c.app.inject({
      method: 'POST',
      url: '/cash/sessions/x/print',
      headers: cajero,
    });
    expect(nada.statusCode).toBe(404);
  });
});

describe('abrir cajón sin venta', () => {
  const abrir = (headers = dueno) =>
    c.app.inject({ method: 'POST', url: '/printer/drawer', headers });

  it('solo el dueño, y manda solo el pulso (sin cortar papel)', async () => {
    expect((await abrir(cajero)).statusCode).toBe(403);
    expect((await abrir()).json()).toEqual({ abierto: false }); // sin impresora
    await configurar({});
    expect((await abrir()).json()).toEqual({ abierto: true });
    expect(Array.from(falso.enviados[0] ?? [])).toEqual([...CMD.inicializar, ...CMD.abrirCajon]);
  });

  it('cajón desactivado o impresora caída', async () => {
    await configurar({ abrirCajon: false });
    expect((await abrir()).json()).toMatchObject({ error: 'CAJON_DESACTIVADO' });
    await configurar({});
    falso.falla = 'No responde';
    const res = await abrir();
    expect(res.statusCode).toBe(503);
  });
});

describe('fila de impresión', () => {
  it('los trabajos de una caja salen de a uno, aunque uno falle', async () => {
    const eventos: string[] = [];
    let n = 0;
    const lento: Transporte = {
      enviar: async () => {
        const i = ++n;
        eventos.push(`inicio ${i}`);
        await new Promise((r) => setTimeout(r, 10));
        eventos.push(`fin ${i}`);
        if (i === 1) throw new ErrorImpresion('falla');
      },
    };
    const s = new ServicioImpresion(() => lento);
    const config = {
      transporte: 'RED' as const,
      destino: 'x',
      anchoMm: 58 as const,
      columnas: null,
      paginaCodigos: 'CP858' as const,
      cortar: true,
      abrirCajon: false,
    };
    const { Documento } = await import('@almacen/printer');
    const doc = new Documento(32).texto('x');
    const r = await Promise.allSettled([
      s.imprimir('caja', config, doc),
      s.imprimir('caja', config, doc),
    ]);
    expect(r.map((x) => x.status)).toEqual(['rejected', 'fulfilled']);
    expect(eventos).toEqual(['inicio 1', 'fin 1', 'inicio 2', 'fin 2']);
  });
});
