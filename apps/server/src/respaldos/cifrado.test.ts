import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cifrarPaquete,
  claveRespaldoABase64,
  claveRespaldoDesdeBase64,
  descifrarPaquete,
  leerClaveRespaldo,
} from './cifrado.js';

const CLAVE = Buffer.alloc(32, 7);
const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'almacen-respaldo-key-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('cifrado de respaldos', () => {
  it('cifra y descifra un paquete', () => {
    const datos = Buffer.from('contenido del respaldo');
    const cifrado = cifrarPaquete(datos, CLAVE);
    expect(cifrado.subarray(0, 8).toString()).toBe('APOSBK01');
    expect(cifrado.includes(datos)).toBe(false);
    expect(descifrarPaquete(cifrado, CLAVE)).toEqual(datos);
  });

  it('falla con otra clave o con datos corruptos', () => {
    const cifrado = cifrarPaquete(Buffer.from('x'), CLAVE);
    expect(() => descifrarPaquete(cifrado, Buffer.alloc(32, 9))).toThrow(
      expect.objectContaining({ codigo: 'RESPALDO_NO_DESCIFRA' }),
    );
    const roto = Buffer.from(cifrado);
    roto[roto.length - 1] = (roto[roto.length - 1] ?? 0) ^ 1;
    expect(() => descifrarPaquete(roto, CLAVE)).toThrow(
      expect.objectContaining({ codigo: 'RESPALDO_NO_DESCIFRA' }),
    );
    expect(() => descifrarPaquete(Buffer.from('no-es-un-paquete'), CLAVE)).toThrow(
      expect.objectContaining({ codigo: 'RESPALDO_CIFRADO_INVALIDO' }),
    );
  });

  it('genera la clave con permisos privados y la reutiliza', () => {
    const ruta = join(tmp(), 'respaldo.key');
    const clave = leerClaveRespaldo(ruta);
    expect(clave).toHaveLength(32);
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(leerClaveRespaldo(ruta).equals(clave)).toBe(true);
  });

  it('convierte la clave a base64url y viceversa', () => {
    const texto = claveRespaldoABase64(CLAVE);
    expect(claveRespaldoDesdeBase64(texto)).toEqual(CLAVE);
    expect(() => claveRespaldoDesdeBase64('corta')).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_RESPALDO_INVALIDA' }),
    );
  });

  it('rechaza una clave local de largo incorrecto', () => {
    const ruta = join(tmp(), 'respaldo.key');
    writeFileSync(ruta, Buffer.alloc(4));
    expect(() => leerClaveRespaldo(ruta)).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_RESPALDO_INVALIDA' }),
    );
    expect(readFileSync(ruta)).toHaveLength(4);
  });
});
