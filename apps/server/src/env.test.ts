import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RUTA_ENV, cargarEnvLocal, variable } from './env.js';

const NOMBRES = ['ALMACEN_TEST_A', 'ALMACEN_TEST_B', 'ALMACEN_TEST_VACIA'];

function archivoEnv(contenido: string): string {
  const ruta = join(mkdtempSync(join(tmpdir(), 'almacen-env-')), '.env');
  writeFileSync(ruta, contenido);
  return ruta;
}

describe('cargarEnvLocal', () => {
  afterEach(() => {
    for (const n of NOMBRES) Reflect.deleteProperty(process.env, n);
  });

  it('apunta al .env de la raíz del repo', () => {
    expect(RUTA_ENV).toMatch(/almacen-pos[/\\]\.env$/);
  });

  it('sin archivo no hace nada', () => {
    expect(cargarEnvLocal(join(tmpdir(), 'no-existe', '.env'))).toBe(false);
  });

  it('carga el archivo sin pisar lo que ya viene del entorno', () => {
    process.env['ALMACEN_TEST_B'] = 'del-entorno';
    const ruta = archivoEnv('# comentario\nALMACEN_TEST_A=hola\nALMACEN_TEST_B=del-archivo\n');
    expect(cargarEnvLocal(ruta)).toBe(true);
    expect(process.env['ALMACEN_TEST_A']).toBe('hola');
    expect(process.env['ALMACEN_TEST_B']).toBe('del-entorno');
  });

  it('una variable vacía cuenta como no definida', () => {
    cargarEnvLocal(archivoEnv('ALMACEN_TEST_VACIA=\nALMACEN_TEST_A=  x  \n'));
    expect(variable('ALMACEN_TEST_VACIA')).toBeUndefined();
    expect(variable('ALMACEN_TEST_A')).toBe('x');
    expect(variable('ALMACEN_TEST_B')).toBeUndefined();
  });
});
