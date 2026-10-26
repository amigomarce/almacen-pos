import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crearPaqueteCifrado, extraerPaqueteCifrado } from './paquete.js';

const CLAVE = Buffer.alloc(32, 3);
const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'almacen-paquete-test-'));
  dirs.push(d);
  return d;
}

function respaldo(): string {
  const dir = tmp();
  writeFileSync(join(dir, 'almacen.sqlite'), 'base-de-prueba');
  writeFileSync(join(dir, 'sii.key'), Buffer.alloc(32, 7));
  writeFileSync(join(dir, 'respaldo.json'), '{"version":1}');
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('paquete cifrado de respaldo', () => {
  it('empaqueta y extrae la base, la clave SII y el manifiesto', async () => {
    const origen = respaldo();
    const paquete = await crearPaqueteCifrado(origen, CLAVE);
    expect(paquete.datos.length).toBeGreaterThan(0);
    expect(paquete.sha256).toMatch(/^[a-f0-9]{64}$/);

    const destino = tmp();
    await extraerPaqueteCifrado(paquete.datos, CLAVE, destino);
    expect(readFileSync(join(destino, 'almacen.sqlite'), 'utf8')).toBe('base-de-prueba');
    expect(readFileSync(join(destino, 'sii.key'))).toHaveLength(32);
    expect(readFileSync(join(destino, 'respaldo.json'), 'utf8')).toBe('{"version":1}');
  });

  it('falla si falta la base o la clave no corresponde', async () => {
    const origen = tmp();
    await expect(crearPaqueteCifrado(origen, CLAVE)).rejects.toMatchObject({
      codigo: 'RESPALDO_NO_ENCONTRADO',
    });

    const paquete = await crearPaqueteCifrado(respaldo(), CLAVE);
    await expect(
      extraerPaqueteCifrado(paquete.datos, Buffer.alloc(32, 9), tmp()),
    ).rejects.toMatchObject({ codigo: 'RESPALDO_NO_DESCIFRA' });
  });
});
