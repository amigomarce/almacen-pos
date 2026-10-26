import { beforeEach, describe, expect, it } from 'vitest';
import { entrarComo, prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;
let dueno: { authorization: string };

beforeEach(async () => {
  c = prepararApp();
  dueno = await entrarComo(c, c.duenoId, '1234');
});

describe('GET /setup', () => {
  it('resume qué falta en la primera configuración', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/setup', headers: dueno });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const datos = res.json<{
      local: { completo: boolean; faltan: string[] };
      boleta: { confirmada: boolean; modalidad: string; siiListo: boolean };
      impresora: { configurada: boolean; transporte: string };
      vinculacion: { installationId: string; deviceToken: string; caja: string };
    }>();
    expect(datos).toMatchObject({
      local: { completo: false, faltan: ['RUT', 'giro', 'dirección'] },
      boleta: { confirmada: false, modalidad: 'MOCK', siiListo: false },
      impresora: { configurada: false, transporte: 'DESACTIVADA' },
      vinculacion: { caja: 'Caja 1' },
    });
    expect(datos.vinculacion.installationId.length).toBeGreaterThan(10);
    expect(datos.vinculacion.deviceToken.length).toBeGreaterThan(20);
  });

  it('queda completo al guardar los datos y confirmar la modalidad', async () => {
    await c.app.inject({
      method: 'PATCH',
      url: '/settings',
      headers: dueno,
      payload: {
        rut: '76.086.428-5',
        razonSocial: 'Almacén Don Pepe',
        giro: 'VENTA AL POR MENOR',
        direccion: 'Av. Siempre Viva 123',
        comuna: 'Ñuñoa',
        dteProvider: 'PUENTE_MANUAL',
      },
    });

    const res = await c.app.inject({ method: 'GET', url: '/setup', headers: dueno });
    expect(res.json()).toMatchObject({
      local: { completo: true, faltan: [] },
      boleta: { confirmada: true, modalidad: 'PUENTE_MANUAL' },
    });
  });

  it('solo el dueño puede verlo', async () => {
    const cajero = await entrarComo(c, c.cajeroId, '0000');
    expect((await c.app.inject({ method: 'GET', url: '/setup', headers: cajero })).statusCode).toBe(
      403,
    );
    expect((await c.app.inject({ method: 'GET', url: '/setup' })).statusCode).toBe(401);
  });
});
