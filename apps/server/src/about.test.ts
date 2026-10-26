import { TEXTO_ATRIBUCION } from '@almacen/data';
import { describe, expect, it } from 'vitest';
import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';
import { Semilla } from './productos/semilla.js';
import { crearSemillaFixture } from './test/semilla-fixture.js';

describe('GET /about', () => {
  it('muestra la atribución ODbL leída de seed_meta', async () => {
    const semilla = Semilla.abrir(crearSemillaFixture());
    const res = await crearApp({ db: abrirDb(':memory:'), semilla }).inject('/about');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      app: 'Almacén POS',
      version: '0.1.0',
      developer: { name: 'Arrayan Labs', email: 'arrayan.labs@gmail.com' },
      license: 'ODbL-1.0',
      license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: TEXTO_ATRIBUCION,
      sources: [{ id: 'off', nombre: 'Open Food Facts', export_del: '2026-10-25' }],
      built_at: '2026-10-25T11:35:19.120Z',
      product_count: 2,
    });
    semilla?.cerrar();
  });

  it('sin semilla igual muestra la licencia y la atribución', async () => {
    const res = await crearApp({ db: abrirDb(':memory:') }).inject('/about');
    expect(res.json()).toMatchObject({
      license: 'ODbL-1.0',
      attribution: TEXTO_ATRIBUCION,
      sources: [],
      built_at: null,
      product_count: null,
    });
  });

  it('tolera sources mal formado en la semilla', async () => {
    const semilla = Semilla.abrir(crearSemillaFixture({ license: 'ODbL-1.0', sources: '{malo' }));
    const res = await crearApp({ db: abrirDb(':memory:'), semilla }).inject('/about');
    expect(res.json()).toMatchObject({ sources: [], attribution: TEXTO_ATRIBUCION });
    semilla?.cerrar();
  });
});
