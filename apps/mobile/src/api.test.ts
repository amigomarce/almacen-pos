import { describe, expect, it, vi } from 'vitest';
import { ClienteApi, ErrorApi, MENSAJE_SIN_CONEXION } from './api.js';

const responder = (estado: number, cuerpo: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('ClienteApi (app del dueño)', () => {
  it('antepone la base a la ruta y devuelve el JSON', async () => {
    const fetchFn = responder(200, { status: 'ok', version: '0.1.0' });
    const cliente = new ClienteApi('http://nube', fetchFn);
    await expect(cliente.estado()).resolves.toEqual({ status: 'ok', version: '0.1.0' });
    expect(fetchFn).toHaveBeenCalledWith('http://nube/health', { method: 'GET', headers: {} });
  });

  it('envía el token y el cuerpo JSON al editar el precio', async () => {
    const fetchFn = responder(200, { id: 'p1' });
    const cliente = new ClienteApi('http://nube', fetchFn);
    cliente.usarToken('jwt');
    await cliente.editarProducto('p1', { priceClp: 1500 });
    expect(fetchFn).toHaveBeenCalledWith('http://nube/products/p1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' },
      body: JSON.stringify({ priceClp: 1500 }),
    });
  });

  it('pide el reporte del período', async () => {
    const fetchFn = responder(200, { dias: 30 });
    const cliente = new ClienteApi('http://nube', fetchFn);
    await cliente.reporte(30);
    expect(fetchFn).toHaveBeenCalledWith('http://nube/report/summary?dias=30', {
      method: 'GET',
      headers: {},
    });
  });

  it('arma la búsqueda de productos', async () => {
    const fetchFn = responder(200, []);
    await new ClienteApi('http://nube', fetchFn).productos('pan', 10);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('http://nube/products?buscar=pan&limite=10');
  });

  it('traduce un error de la nube con su código y mensaje', async () => {
    const cliente = new ClienteApi(
      'http://nube',
      responder(404, { error: 'NO_ENCONTRADO', mensaje: 'Producto no encontrado' }),
    );
    const error = await cliente.producto('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      estado: 404,
      codigo: 'NO_ENCONTRADO',
      message: 'Producto no encontrado',
    });
  });

  it('avisa sin conexión si la nube no responde', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await new ClienteApi('http://nube', fetchFn).estado().catch((e: unknown) => e);
    expect(error).toMatchObject({
      estado: 0,
      codigo: 'SIN_CONEXION',
      message: MENSAJE_SIN_CONEXION,
    });
  });

  it('el cambio masivo envía filtro y porcentaje', async () => {
    const fetchFn = responder(200, { cantidad: 0, productos: [] });
    await new ClienteApi('http://nube', fetchFn).cambioMasivo({ marca: 'Genérica' }, 5);
    expect(fetchFn).toHaveBeenCalledWith('http://nube/products/bulk-price', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filtro: { marca: 'Genérica' }, porcentaje: 5 }),
    });
  });

  it('vincula la caja con su token de dispositivo', async () => {
    const fetchFn = responder(201, { id: 'inst-1', name: 'Caja 1', linkedAt: null });
    await new ClienteApi('http://nube', fetchFn).vincularCaja('inst-1', 'tok-123', 'Caja 1');
    expect(fetchFn).toHaveBeenCalledWith('http://nube/installations/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', deviceToken: 'tok-123', name: 'Caja 1' }),
    });
  });
});
