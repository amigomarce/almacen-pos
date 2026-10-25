import { describe, expect, it, vi } from 'vitest';
import { ClienteApi, ErrorApi, MENSAJE_SIN_CONEXION } from './api.js';

const responder = (estado: number, cuerpo: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('ClienteApi', () => {
  it('antepone la base a la ruta y devuelve el JSON', async () => {
    const fetchFn = responder(200, { status: 'ok', version: '0.1.0' });
    const cliente = new ClienteApi('/api', fetchFn);
    await expect(cliente.estado()).resolves.toEqual({ status: 'ok', version: '0.1.0' });
    expect(fetchFn).toHaveBeenCalledWith('/api/health', undefined);
  });

  it('traduce un error del servidor con su código y mensaje', async () => {
    const cliente = new ClienteApi(
      '/api',
      responder(400, { error: 'CODIGO_INVALIDO', mensaje: 'Código de barras inválido' }),
    );
    const error = await cliente.pedir('/products/lookup/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      estado: 400,
      codigo: 'CODIGO_INVALIDO',
      message: 'Código de barras inválido',
    });
  });

  it('usa un mensaje genérico si el error no trae cuerpo JSON', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('boom', { status: 500 }));
    const error = await new ClienteApi('/api', fetchFn).pedir('/x').catch((e: unknown) => e);
    expect(error).toMatchObject({
      estado: 500,
      codigo: null,
      message: 'El servidor respondió con error 500',
    });
  });

  it('avisa sin conexión si el servidor no responde', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await new ClienteApi('/api', fetchFn).estado().catch((e: unknown) => e);
    expect(error).toMatchObject({
      estado: 0,
      codigo: 'SIN_CONEXION',
      message: MENSAJE_SIN_CONEXION,
    });
  });
});
