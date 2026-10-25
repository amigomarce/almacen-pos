import { beforeEach, describe, expect, it } from 'vitest';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { obtenerIdentidad } from './identidad.js';
import { prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;

beforeEach(() => {
  c = prepararApp();
});

describe('obtenerIdentidad', () => {
  it('genera una identidad estable y la persiste', () => {
    const primera = obtenerIdentidad(c.db);
    expect(primera.installationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(primera.deviceToken.length).toBeGreaterThan(20);
    expect(obtenerIdentidad(c.db)).toEqual(primera);
  });

  it('crea la fila de store_settings si no existe', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    const identidad = obtenerIdentidad(db);
    expect(identidad.installationId).toBeTruthy();
    expect(obtenerIdentidad(db)).toEqual(identidad);
  });
});
