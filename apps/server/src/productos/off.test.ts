import { cargarNormalizacion } from '@almacen/data';
import { describe, expect, it, vi } from 'vitest';
import { ClienteOff, type OpcionesClienteOff } from './off.js';

// Los CSV reales de data/ (archivos locales, sin internet).
const normalizacion = cargarNormalizacion();

const QUESILLO = {
  code: '7802920000749',
  product_name: 'Mi Quesillo Fresco y Natural',
  brands: 'Colun, Colún',
  quantity: '320g',
  categories_tags: ['en:dairies', 'en:cheeses'],
  image_url: 'https://images.openfoodfacts.org/images/products/780/292/000/0749/front_es.7.400.jpg',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function crear(
  respuesta: (url: string, init?: RequestInit) => Promise<Response>,
  extra: Partial<OpcionesClienteOff> = {},
) {
  const fetch = vi.fn(respuesta);
  let reloj = 1_000_000;
  const cliente = new ClienteOff({
    version: '0.1.0',
    contacto: 'contacto@ejemplo.cl',
    normalizacion,
    fetch: fetch as unknown as typeof globalThis.fetch,
    ahora: () => reloj,
    ...extra,
  });
  return { cliente, fetch, avanzar: (ms: number) => (reloj += ms) };
}

describe('ClienteOff', () => {
  it('consulta la API v2 con los campos y el User-Agent que pide OFF', async () => {
    const { cliente, fetch } = crear(() => Promise.resolve(json({ status: 1, product: QUESILLO })));
    await cliente.buscar('7802920000749');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://world.openfoodfacts.org/api/v2/product/7802920000749?fields=code,product_name,generic_name,brands,quantity,categories_tags,image_url',
    );
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      'AlmacenPOS/0.1.0 (contacto@ejemplo.cl)',
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('normaliza con el mismo código que la semilla', async () => {
    const { cliente } = crear(() => Promise.resolve(json({ status: 1, product: QUESILLO })));
    expect(await cliente.buscar('7802920000749')).toEqual({
      ok: true,
      producto: {
        barcode: '7802920000749',
        name: 'Colún Mi Quesillo Fresco y Natural 320 g',
        brand: 'Colún',
        format: '320 g',
        unit: 'UN',
        categorySlug: 'quesos',
        imageUrl: QUESILLO.image_url,
        seedRef: null,
      },
    });
  });

  it('usa generic_name si no hay product_name y "otros" sin categoría', async () => {
    const { cliente } = crear(() =>
      Promise.resolve(
        json({ status: 1, product: { generic_name: 'xyzzy', image_url: 'http://x' } }),
      ),
    );
    const r = await cliente.buscar('7800000000017');
    expect(r).toMatchObject({
      ok: true,
      producto: { name: 'Xyzzy', brand: null, format: null, categorySlug: 'otros', imageUrl: null },
    });
  });

  it.each([
    ['404', () => json({ status: 0, status_verbose: 'product not found' }, 404), 'NO_EXISTE'],
    ['status 0', () => json({ status: 0 }), 'NO_EXISTE'],
    ['sin nombre', () => json({ status: 1, product: { brands: 'X' } }), 'SIN_NOMBRE'],
    ['error 503', () => json({}, 503), 'FALLO'],
    ['JSON malo', () => new Response('<html>', { status: 200 }), 'FALLO'],
  ])('%s → sin producto', async (_caso, r, motivo) => {
    const { cliente } = crear(() => Promise.resolve(r()));
    expect(await cliente.buscar('7800000000017')).toEqual({ ok: false, motivo });
  });

  it('sin internet → FALLO sin lanzar', async () => {
    const { cliente } = crear(() => Promise.reject(new TypeError('fetch failed')));
    expect(await cliente.buscar('7800000000017')).toEqual({ ok: false, motivo: 'FALLO' });
  });

  it('corta por timeout', async () => {
    const { cliente } = crear(
      (_url, init) =>
        new Promise((_ok, falla) => {
          init?.signal?.addEventListener('abort', () => {
            falla(new DOMException('timeout', 'TimeoutError'));
          });
        }),
      { timeoutMs: 20 },
    );
    expect(await cliente.buscar('7800000000017')).toEqual({ ok: false, motivo: 'FALLO' });
  });

  it('guarda en caché encontrados y no encontrados, y vencen', async () => {
    const { cliente, fetch, avanzar } = crear((url) =>
      Promise.resolve(
        url.includes('7802920000749')
          ? json({ status: 1, product: QUESILLO })
          : json({ status: 0 }, 404),
      ),
    );
    await cliente.buscar('7802920000749');
    await cliente.buscar('7802920000749');
    await cliente.buscar('7800000000017');
    await cliente.buscar('7800000000017');
    expect(fetch).toHaveBeenCalledTimes(2);

    avanzar(2 * 60 * 60_000); // 2 h: vence el "no encontrado" (1 h), no el encontrado (24 h)
    await cliente.buscar('7802920000749');
    await cliente.buscar('7800000000017');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('recuerda un fallo un minuto para no esperar el timeout en cada escaneo', async () => {
    const { cliente, fetch, avanzar } = crear(() => Promise.reject(new TypeError('offline')));
    await cliente.buscar('7800000000017');
    await cliente.buscar('7800000000017');
    expect(fetch).toHaveBeenCalledTimes(1);
    avanzar(61_000);
    await cliente.buscar('7800000000017');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('no pasa de 10 consultas por minuto', async () => {
    const { cliente, fetch, avanzar } = crear(() => Promise.resolve(json({ status: 0 }, 404)));
    const codigos = Array.from({ length: 11 }, (_, i) => `78000000${String(i).padStart(4, '0')}0`);
    const r = [];
    for (const c of codigos) r.push(await cliente.buscar(c));
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(r.at(-1)).toEqual({ ok: false, motivo: 'LIMITE' });

    avanzar(60_001);
    expect(await cliente.buscar(codigos[10] ?? '')).toEqual({ ok: false, motivo: 'NO_EXISTE' });
    expect(fetch).toHaveBeenCalledTimes(11);
  });

  it('una sola consulta para escaneos simultáneos del mismo código', async () => {
    const { cliente, fetch } = crear(() => Promise.resolve(json({ status: 1, product: QUESILLO })));
    const [a, b] = await Promise.all([
      cliente.buscar('7802920000749'),
      cliente.buscar('7802920000749'),
    ]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('respeta el tamaño máximo de la caché', async () => {
    const { cliente, fetch } = crear(() => Promise.resolve(json({ status: 0 }, 404)), {
      maxCache: 2,
    });
    for (const c of ['7800000000017', '7800000000024', '7800000000031']) await cliente.buscar(c);
    await cliente.buscar('7800000000017'); // el más antiguo salió de la caché
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
