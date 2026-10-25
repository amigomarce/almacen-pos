import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { crearSemillaFixture } from '../test/semilla-fixture.js';
import { Semilla } from './semilla.js';

describe('Semilla', () => {
  it('devuelve null si el archivo no existe', () => {
    expect(Semilla.abrir(join('/no', 'existe', 'seed.sqlite'))).toBeNull();
  });

  it('abre en solo lectura y busca por código canónico', () => {
    const semilla = Semilla.abrir(crearSemillaFixture());
    expect(semilla?.meta['schema_version']).toBe('1');
    expect(semilla?.buscar('7802920000749')?.name).toBe('Colún Mi Quesillo Fresco y Natural 320 g');
    expect(semilla?.buscar('7800000000000')).toBeNull();
    expect(() => semilla?.['db'].exec('DELETE FROM seed_products')).toThrow(/readonly/);
    semilla?.cerrar();
  });

  it('rechaza una semilla con otra versión de esquema', () => {
    const ruta = crearSemillaFixture();
    const db = new Database(ruta);
    db.prepare("UPDATE seed_meta SET value = '99' WHERE key = 'schema_version'").run();
    db.close();
    expect(() => Semilla.abrir(ruta)).toThrow(/schema_version 99/);
  });
});
