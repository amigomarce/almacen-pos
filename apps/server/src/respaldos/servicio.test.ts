import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirDb, type Db } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { storeSettings } from '../db/schema.js';
import {
  crearRespaldo,
  listarRespaldos,
  nombreRespaldo,
  podarRespaldos,
  respaldarSiCorresponde,
  restaurarRespaldo,
} from './servicio.js';

const T0 = new Date('2026-10-25T23:10:00-03:00');
const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'almacen-respaldos-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function base(razonSocial = 'Almacén de Prueba'): { db: Db; rutaDb: string; dir: string } {
  const dir = tmp();
  const rutaDb = join(dir, 'almacen.sqlite');
  const db = abrirDb(rutaDb);
  migrar(db);
  db.insert(storeSettings).values({ razonSocial }).run();
  return { db, rutaDb, dir: join(dir, 'respaldos') };
}

function nombreEnDb(ruta: string): string | null {
  const db = new Database(ruta, { readonly: true, fileMustExist: true });
  try {
    return (
      (
        db.prepare('select razon_social from store_settings limit 1').get() as
          { razon_social: string | null } | undefined
      )?.razon_social ?? null
    );
  } finally {
    db.close();
  }
}

describe('nombre y listado', () => {
  it('nombra el respaldo con la hora de Chile', () => {
    expect(nombreRespaldo(new Date('2026-10-26T02:30:00Z'))).toBe('almacen-2026-10-25_23-30-00');
  });

  it('sin carpeta no hay respaldos', () => {
    expect(listarRespaldos(join(tmp(), 'no-existe'))).toEqual([]);
  });
});

describe('crearRespaldo', () => {
  it('copia la base, la clave del SII y deja un manifiesto privado', async () => {
    const { db, rutaDb, dir } = base();
    const clave = join(tmp(), 'sii.key');
    writeFileSync(clave, Buffer.alloc(32, 7));

    const info = await crearRespaldo(db, {
      dir,
      rutaDb,
      rutaClaveSii: clave,
      ahora: () => T0,
    });

    expect(info).toMatchObject({
      nombre: 'almacen-2026-10-25_23-10-00',
      creadoEn: T0,
      incluyeClaveSii: true,
    });
    expect(info.tamanoBytes).toBeGreaterThan(0);
    const carpeta = join(dir, info.nombre);
    expect(existsSync(join(carpeta, 'almacen.sqlite'))).toBe(true);
    expect(existsSync(join(carpeta, 'sii.key'))).toBe(true);
    expect(nombreEnDb(join(carpeta, 'almacen.sqlite'))).toBe('Almacén de Prueba');
    expect(statSync(join(carpeta, 'almacen.sqlite')).mode & 0o777).toBe(0o600);
    expect(statSync(join(carpeta, 'sii.key')).mode & 0o777).toBe(0o600);
    const manifiesto = JSON.parse(readFileSync(join(carpeta, 'respaldo.json'), 'utf8')) as {
      creadoEn: string;
      incluyeClaveSii: boolean;
    };
    expect(manifiesto).toEqual({ version: 1, creadoEn: T0.toISOString(), incluyeClaveSii: true });
    db.$client.close();
  });

  it('no incluye clave si no existe y evita colisiones de nombre', async () => {
    const { db, rutaDb, dir } = base();
    const uno = await crearRespaldo(db, { dir, rutaDb, ahora: () => T0 });
    const dos = await crearRespaldo(db, { dir, rutaDb, ahora: () => T0 });
    expect(dos.nombre).toBe(`${uno.nombre}-2`);
    expect(dos.incluyeClaveSii).toBe(false);
    db.$client.close();
  });

  it('no deja una carpeta a medias si la copia falla', async () => {
    const { db, rutaDb, dir } = base();
    const roto = {
      $client: { backup: () => Promise.reject(new Error('disco lleno')) },
    } as unknown as Db;
    await expect(crearRespaldo(roto, { dir, rutaDb, ahora: () => T0 })).rejects.toThrow(
      'disco lleno',
    );
    expect(listarRespaldos(dir)).toEqual([]);
    db.$client.close();
  });
});

describe('listar y podar', () => {
  it('ordena del más nuevo al más viejo y poda los antiguos', async () => {
    const { db, rutaDb, dir } = base();
    for (let i = 0; i < 3; i += 1) {
      await crearRespaldo(db, {
        dir,
        rutaDb,
        ahora: () => new Date(T0.getTime() + i * 3_600_000),
      });
    }
    expect(listarRespaldos(dir).map((r) => r.nombre)).toEqual([
      'almacen-2026-10-26_01-10-00',
      'almacen-2026-10-26_00-10-00',
      'almacen-2026-10-25_23-10-00',
    ]);

    expect(podarRespaldos(dir, 2)).toEqual(['almacen-2026-10-25_23-10-00']);
    expect(listarRespaldos(dir)).toHaveLength(2);
    expect(() => podarRespaldos(dir, 0)).toThrow(
      expect.objectContaining({ codigo: 'RETENCION_INVALIDA' }),
    );
    db.$client.close();
  });

  it('ignora archivos y carpetas que no son respaldos', async () => {
    const { db, rutaDb, dir } = base();
    await crearRespaldo(db, { dir, rutaDb, ahora: () => T0 });
    writeFileSync(join(dir, 'nota.txt'), 'x');
    expect(listarRespaldos(dir)).toHaveLength(1);
    db.$client.close();
  });
});

describe('respaldarSiCorresponde', () => {
  it('crea el primero, espera el intervalo y vuelve a crear', async () => {
    const { db, rutaDb, dir } = base();
    let ahora = T0;
    const opciones = { dir, rutaDb, ahora: () => ahora };

    expect(await respaldarSiCorresponde(db, opciones)).not.toBeNull();
    expect(await respaldarSiCorresponde(db, opciones)).toBeNull();

    ahora = new Date(T0.getTime() + 21 * 3_600_000);
    const segundo = await respaldarSiCorresponde(db, opciones);
    expect(segundo).not.toBeNull();
    expect(listarRespaldos(dir)).toHaveLength(2);
    db.$client.close();
  });

  it('respeta la retención configurada', async () => {
    const { db, rutaDb, dir } = base();
    let ahora = T0;
    for (let i = 0; i < 3; i += 1) {
      await respaldarSiCorresponde(db, {
        dir,
        rutaDb,
        ahora: () => ahora,
        horasEntreRespaldos: 0,
        retener: 2,
      });
      ahora = new Date(ahora.getTime() + 60_000);
    }
    expect(listarRespaldos(dir)).toHaveLength(2);
    db.$client.close();
  });
});

describe('restaurarRespaldo', () => {
  it('restaura la base y la clave, y guarda una copia de la anterior', async () => {
    const { db, rutaDb, dir } = base('Antes');
    const clave = join(tmp(), 'sii.key');
    writeFileSync(clave, Buffer.alloc(32, 7));
    const info = await crearRespaldo(db, { dir, rutaDb, rutaClaveSii: clave, ahora: () => T0 });

    db.update(storeSettings).set({ razonSocial: 'Después' }).run();
    db.$client.close();

    const resultado = await restaurarRespaldo({
      respaldo: join(dir, info.nombre),
      rutaDb,
      rutaClaveSii: clave,
      ahora: () => T0,
    });

    expect(nombreEnDb(rutaDb)).toBe('Antes');
    expect(resultado.incluyeClaveSii).toBe(true);
    expect(resultado.copiaPrevia).not.toBeNull();
    expect(nombreEnDb(resultado.copiaPrevia ?? '')).toBe('Después');
    expect(statSync(rutaDb).mode & 0o777).toBe(0o600);
  });

  it('funciona si no existía una base previa', async () => {
    const { db, rutaDb, dir } = base();
    const info = await crearRespaldo(db, { dir, rutaDb, ahora: () => T0 });
    db.$client.close();
    rmSync(rutaDb);

    const resultado = await restaurarRespaldo({
      respaldo: join(dir, info.nombre),
      rutaDb,
      ahora: () => T0,
    });
    expect(resultado.copiaPrevia).toBeNull();
    expect(nombreEnDb(rutaDb)).toBe('Almacén de Prueba');
  });

  it('rechaza una carpeta inexistente o un archivo que no es la base', async () => {
    const { db, rutaDb, dir } = base();
    db.$client.close();
    await expect(
      restaurarRespaldo({ respaldo: join(dir, 'no-existe'), rutaDb }),
    ).rejects.toMatchObject({ codigo: 'RESPALDO_NO_ENCONTRADO' });

    const memoria = abrirDb(':memory:');
    const info = await crearRespaldo(memoria, { dir, rutaDb: ':memory:' });
    memoria.$client.close();
    // Se reemplaza el archivo del respaldo por basura.
    writeFileSync(join(dir, info.nombre, 'almacen.sqlite'), 'no es sqlite');
    await expect(
      restaurarRespaldo({ respaldo: join(dir, info.nombre), rutaDb }),
    ).rejects.toMatchObject({ codigo: 'RESPALDO_INVALIDO' });
  });
});
