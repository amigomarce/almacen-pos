import { describe, expect, it, vi } from 'vitest';
import { cabecerasAuth, crearAlmacenSupabase } from './almacen.js';

const OPCIONES = {
  url: 'https://proyecto.supabase.co/',
  serviceKey: 'service-role',
  bucket: 'respaldos',
};

describe('adaptador de Supabase Storage', () => {
  it('sube con autenticación, upsert y la ruta codificada', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
    const almacen = crearAlmacenSupabase({ ...OPCIONES, fetchFn });
    await almacen.subir('dueno/inst/a b.apos', Buffer.from('datos'), 'application/octet-stream');

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://proyecto.supabase.co/storage/v1/object/respaldos/dueno/inst/a%20b.apos',
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer service-role');
    expect(headers.get('apikey')).toBe('service-role');
    expect(headers.get('x-upsert')).toBe('true');
    expect(init?.method).toBe('POST');
  });

  it('con una secret key nueva (sb_secret_…) usa solo apikey, no Bearer', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
    const almacen = crearAlmacenSupabase({ ...OPCIONES, serviceKey: 'sb_secret_abc', fetchFn });
    await almacen.subir('x.apos', Buffer.from('d'), 'application/octet-stream');
    const headers = new Headers(fetchFn.mock.calls[0]?.[1]?.headers);
    expect(headers.get('apikey')).toBe('sb_secret_abc');
    expect(headers.has('authorization')).toBe(false);
    expect(cabecerasAuth('eyJ.jwt.legacy')).toEqual({
      authorization: 'Bearer eyJ.jwt.legacy',
      apikey: 'eyJ.jwt.legacy',
    });
  });

  it('descarga y distingue el 404', async () => {
    const almacen = crearAlmacenSupabase({
      ...OPCIONES,
      fetchFn: () => Promise.resolve(new Response('abc', { status: 200 })),
    });
    expect((await almacen.descargar('a/b.apos')).toString()).toBe('abc');

    const noExiste = crearAlmacenSupabase({
      ...OPCIONES,
      fetchFn: () => Promise.resolve(new Response('', { status: 404 })),
    });
    await expect(noExiste.descargar('a/b.apos')).rejects.toMatchObject({
      codigo: 'RESPALDO_NO_ENCONTRADO',
    });
  });

  it('elimina y tolera el 404', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 404 })));
    const almacen = crearAlmacenSupabase({ ...OPCIONES, fetchFn });
    await expect(almacen.eliminar('a/b.apos')).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('rechaza un bucket inválido', () => {
    expect(() => crearAlmacenSupabase({ ...OPCIONES, bucket: 'Nombre Con Espacios' })).toThrow(
      expect.objectContaining({ codigo: 'BUCKET_INVALIDO' }),
    );
  });

  it('traduce errores de subida y descarga', async () => {
    const almacen = crearAlmacenSupabase({
      ...OPCIONES,
      fetchFn: () => Promise.resolve(new Response('', { status: 500 })),
    });
    await expect(almacen.subir('a.apos', Buffer.from('x'), 'x')).rejects.toMatchObject({
      codigo: 'ALMACEN_ERROR',
    });
    await expect(almacen.descargar('a.apos')).rejects.toMatchObject({ codigo: 'ALMACEN_ERROR' });
  });
});
