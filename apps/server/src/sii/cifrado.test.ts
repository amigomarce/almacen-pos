import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cifrar, descifrar, leerClaveSii } from './cifrado.js';

const CLAVE = Buffer.alloc(32, 3);
const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'almacen-sii-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('cifrado de secretos del SII', () => {
  it('cifra y descifra un texto', () => {
    const valor = cifrar('certificado y clave', CLAVE);
    expect(valor.startsWith('v1:')).toBe(true);
    expect(valor).not.toContain('certificado');
    expect(descifrar(valor, CLAVE)).toBe('certificado y clave');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(cifrar('x', CLAVE)).not.toBe(cifrar('x', CLAVE));
  });

  it('acepta texto sin cifrar (compatibilidad con cargas manuales)', () => {
    expect(descifrar('<CAF>...</CAF>', CLAVE)).toBe('<CAF>...</CAF>');
  });

  it('falla si la clave no es de 32 bytes', () => {
    expect(() => cifrar('x', Buffer.alloc(10))).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_SII_INVALIDA' }),
    );
    expect(() => descifrar(cifrar('x', CLAVE), Buffer.alloc(10))).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_SII_INVALIDA' }),
    );
  });

  it('falla si el secreto está corrupto o la clave cambió', () => {
    expect(() => descifrar('v1:aaaa:bbbb:cccc', CLAVE)).toThrow(
      expect.objectContaining({ codigo: 'SECRETO_SII_INVALIDO' }),
    );
    const otro = Buffer.alloc(32, 9);
    expect(() => descifrar(cifrar('x', CLAVE), otro)).toThrow(
      expect.objectContaining({ codigo: 'SECRETO_SII_INVALIDO' }),
    );
    expect(() => descifrar('v1:solo-dos', CLAVE)).toThrow(
      expect.objectContaining({ codigo: 'SECRETO_SII_INVALIDO' }),
    );
  });

  it('genera la clave local con permisos 600 y la reutiliza', () => {
    const ruta = join(tmp(), 'sii.key');
    const primera = leerClaveSii(ruta);
    expect(primera).toHaveLength(32);
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(leerClaveSii(ruta).equals(primera)).toBe(true);
  });

  it('rechaza una clave local con largo incorrecto', () => {
    const ruta = join(tmp(), 'sii.key');
    writeFileSync(ruta, Buffer.alloc(5));
    expect(() => leerClaveSii(ruta)).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_SII_INVALIDA' }),
    );
  });
});
