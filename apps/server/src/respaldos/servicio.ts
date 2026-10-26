import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { ErrorDominio } from '@almacen/core';
import type { Db } from '../db/client.js';

/** Un respaldo por día; se conservan los últimos 14. */
export const RETENCION_POR_DEFECTO = 14;
export const HORAS_ENTRE_RESPALDOS = 20;
export const INTERVALO_RESPALDO_MS = 6 * 60 * 60_000;

const PREFIJO = 'almacen-';
const MANIFIESTO = 'respaldo.json';
const NOMBRE_DB = 'almacen.sqlite';
const NOMBRE_CLAVE = 'sii.key';

export interface OpcionesRespaldo {
  /** Carpeta donde se crean las subcarpetas de respaldo. */
  dir: string;
  /** Ruta de la base viva. */
  rutaDb: string;
  /** Clave del SII; si existe, se copia al respaldo para poder descifrar la base restaurada. */
  rutaClaveSii?: string;
  ahora?: () => Date;
  retener?: number;
  horasEntreRespaldos?: number;
}

export interface EstadoNubeRespaldo {
  subidoEn?: string;
  id?: string;
  objeto?: string;
  sha256?: string;
  error?: string;
  intentoEn?: string;
}

export interface RespaldoInfo {
  nombre: string;
  creadoEn: Date;
  tamanoBytes: number;
  incluyeClaveSii: boolean;
  /** Estado del envío cifrado a la nube, si se intentó. */
  nube: EstadoNubeRespaldo | null;
}

export interface Manifiesto {
  version: number;
  creadoEn: string;
  incluyeClaveSii: boolean;
  nube?: EstadoNubeRespaldo;
}

export interface LoggerRespaldos {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/** Nombre local de Chile, legible para el dueño: `almacen-2026-10-25_23-10-00`. */
export function nombreRespaldo(fecha: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${PREFIJO}${partes['year']}-${partes['month']}-${partes['day']}_${partes['hour']}-${partes['minute']}-${partes['second']}`;
}

function tamanoDirectorio(ruta: string): number {
  let total = 0;
  for (const entrada of readdirSync(ruta, { withFileTypes: true })) {
    const hijo = join(ruta, entrada.name);
    total += entrada.isDirectory() ? tamanoDirectorio(hijo) : statSync(hijo).size;
  }
  return total;
}

function leerManifiesto(destino: string, mtime: Date): Manifiesto {
  try {
    const crudo = JSON.parse(
      readFileSync(join(destino, MANIFIESTO), 'utf8'),
    ) as Partial<Manifiesto>;
    const fecha = new Date(crudo.creadoEn ?? '');
    return {
      version: 1,
      creadoEn: Number.isNaN(fecha.getTime()) ? mtime.toISOString() : fecha.toISOString(),
      incluyeClaveSii: crudo.incluyeClaveSii ?? existsSync(join(destino, NOMBRE_CLAVE)),
      ...(crudo.nube && typeof crudo.nube === 'object' ? { nube: crudo.nube } : {}),
    };
  } catch {
    return {
      version: 1,
      creadoEn: mtime.toISOString(),
      incluyeClaveSii: existsSync(join(destino, NOMBRE_CLAVE)),
    };
  }
}

/** Manifiesto de un respaldo concreto (para el envío a la nube). */
export function leerManifiestoRespaldo(dir: string, nombre: string): Manifiesto {
  const destino = join(dir, nombre);
  return leerManifiesto(destino, statSync(destino).mtime);
}

/** Actualiza el manifiesto sin dejar un JSON a medias (escribe y renombra). */
export function actualizarManifiestoRespaldo(
  dir: string,
  nombre: string,
  cambios: Partial<Manifiesto>,
): void {
  const destino = join(dir, nombre);
  const actual = leerManifiesto(destino, statSync(destino).mtime);
  const siguiente: Manifiesto = { ...actual, ...cambios };
  const ruta = join(destino, MANIFIESTO);
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(siguiente, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, ruta);
}

/** Respaldos válidos, del más nuevo al más antiguo. */
export function listarRespaldos(dir: string): RespaldoInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(PREFIJO))
    .flatMap((d) => {
      const destino = join(dir, d.name);
      if (!existsSync(join(destino, NOMBRE_DB))) return [];
      const manifiesto = leerManifiesto(destino, statSync(destino).mtime);
      return [
        {
          nombre: d.name,
          creadoEn: new Date(manifiesto.creadoEn),
          tamanoBytes: tamanoDirectorio(destino),
          incluyeClaveSii: manifiesto.incluyeClaveSii,
          nube: manifiesto.nube ?? null,
        },
      ];
    })
    .sort(
      (a, b) => b.creadoEn.getTime() - a.creadoEn.getTime() || b.nombre.localeCompare(a.nombre),
    );
}

function nombreLibre(dir: string, base: string): string {
  let nombre = base;
  let n = 2;
  while (existsSync(join(dir, nombre))) {
    nombre = `${base}-${n}`;
    n += 1;
  }
  return nombre;
}

/**
 * Crea una copia consistente de la base (better-sqlite3 usa la API de backup de SQLite, que
 * respeta WAL) y, si existe, de la clave local del SII. El respaldo queda en una carpeta
 * privada: sin la clave, las credenciales SII de la base restaurada no se pueden descifrar.
 */
export async function crearRespaldo(db: Db, opciones: OpcionesRespaldo): Promise<RespaldoInfo> {
  const fecha = opciones.ahora?.() ?? new Date();
  mkdirSync(opciones.dir, { recursive: true, mode: 0o700 });
  chmodSync(opciones.dir, 0o700);
  const nombre = nombreLibre(opciones.dir, nombreRespaldo(fecha));
  const destino = join(opciones.dir, nombre);
  mkdirSync(destino, { mode: 0o700 });

  try {
    const rutaDbRespaldo = join(destino, NOMBRE_DB);
    await db.$client.backup(rutaDbRespaldo);
    chmodSync(rutaDbRespaldo, 0o600);

    let incluyeClaveSii = false;
    if (opciones.rutaClaveSii && existsSync(opciones.rutaClaveSii)) {
      const claveDestino = join(destino, NOMBRE_CLAVE);
      copyFileSync(opciones.rutaClaveSii, claveDestino);
      chmodSync(claveDestino, 0o600);
      incluyeClaveSii = true;
    }

    const manifiesto: Manifiesto = {
      version: 1,
      creadoEn: fecha.toISOString(),
      incluyeClaveSii,
    };
    const rutaManifiesto = join(destino, MANIFIESTO);
    writeFileSync(rutaManifiesto, `${JSON.stringify(manifiesto, null, 2)}\n`);
    chmodSync(rutaManifiesto, 0o600);

    return {
      nombre,
      creadoEn: fecha,
      tamanoBytes: tamanoDirectorio(destino),
      incluyeClaveSii,
      nube: null,
    };
  } catch (error) {
    // No se deja un respaldo a medias que parezca válido.
    rmSync(destino, { recursive: true, force: true });
    throw error;
  }
}

/** Borra los respaldos más antiguos y conserva los últimos `retener`. */
export function podarRespaldos(dir: string, retener = RETENCION_POR_DEFECTO): string[] {
  if (!Number.isInteger(retener) || retener < 1) {
    throw new ErrorDominio('RETENCION_INVALIDA', 'Hay que conservar al menos un respaldo');
  }
  const borrados = listarRespaldos(dir).slice(retener);
  for (const r of borrados) {
    rmSync(join(dir, r.nombre), { recursive: true, force: true });
  }
  return borrados.map((r) => r.nombre);
}

/** Crea un respaldo solo si pasó el intervalo mínimo (por defecto, 20 horas). */
export async function respaldarSiCorresponde(
  db: Db,
  opciones: OpcionesRespaldo,
): Promise<RespaldoInfo | null> {
  const ahora = opciones.ahora?.() ?? new Date();
  const [ultimo] = listarRespaldos(opciones.dir);
  const horas = opciones.horasEntreRespaldos ?? HORAS_ENTRE_RESPALDOS;
  if (ultimo && ahora.getTime() - ultimo.creadoEn.getTime() < horas * 3_600_000) return null;

  const info = await crearRespaldo(db, { ...opciones, ahora: () => ahora });
  podarRespaldos(opciones.dir, opciones.retener ?? RETENCION_POR_DEFECTO);
  return info;
}

/**
 * Ciclo automático: revisa al arrancar y cada `intervaloMs`. Si la caja estuvo apagada, el
 * primer respaldo sale apenas vuelve. Nunca solapa una pasada con otra.
 */
export function iniciarRespaldos(
  db: Db,
  opciones: OpcionesRespaldo & {
    intervaloMs?: number;
    log: LoggerRespaldos;
    /** Se llama después de crear un respaldo (por ejemplo, para subirlo a la nube). */
    alCrear?: (info: RespaldoInfo) => Promise<void>;
  },
): () => void {
  let enCurso = false;
  const pasada = async (): Promise<void> => {
    if (enCurso) return;
    enCurso = true;
    try {
      const info = await respaldarSiCorresponde(db, opciones);
      if (info) {
        opciones.log.info(
          { respaldo: info.nombre, bytes: info.tamanoBytes, claveSii: info.incluyeClaveSii },
          'Respaldo automático creado',
        );
        try {
          await opciones.alCrear?.(info);
        } catch (error) {
          opciones.log.warn(
            { err: error },
            'El respaldo local se creó, pero no se pudo subir a la nube',
          );
        }
      }
    } catch (error) {
      opciones.log.error({ err: error }, 'Falló el respaldo automático');
    } finally {
      enCurso = false;
    }
  };

  void pasada();
  const timer = setInterval(() => {
    void pasada();
  }, opciones.intervaloMs ?? INTERVALO_RESPALDO_MS);
  return () => {
    clearInterval(timer);
  };
}

export interface DatosRestauracion {
  /** Carpeta del respaldo (la que contiene `almacen.sqlite`). */
  respaldo: string;
  rutaDb: string;
  rutaClaveSii?: string;
  ahora?: () => Date;
}

export interface ResultadoRestauracion {
  copiaPrevia: string | null;
  incluyeClaveSii: boolean;
}

function validarRespaldo(rutaDb: string): void {
  let db: Database.Database | null = null;
  try {
    db = new Database(rutaDb, { readonly: true, fileMustExist: true });
    const tablas = new Set(
      db
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map((f) => (f as { name: string }).name),
    );
    if (!['store_settings', 'products', 'sales'].every((t) => tablas.has(t))) {
      throw new ErrorDominio(
        'RESPALDO_INVALIDO',
        'El archivo no parece una base de Almacén POS (faltan tablas)',
      );
    }
  } catch (error) {
    if (error instanceof ErrorDominio) throw error;
    throw new ErrorDominio('RESPALDO_INVALIDO', 'El archivo no es una base SQLite válida');
  } finally {
    db?.close();
  }
}

/**
 * Restaura un respaldo sobre la base viva. Pensado para la caja **detenida** (el CLI avisa si
 * el servidor responde). Antes de pisar la base guarda una copia consistente de la actual.
 */
export async function restaurarRespaldo(datos: DatosRestauracion): Promise<ResultadoRestauracion> {
  const origen = join(datos.respaldo, NOMBRE_DB);
  if (!existsSync(origen)) {
    throw new ErrorDominio(
      'RESPALDO_NO_ENCONTRADO',
      `No existe ${origen}; indica la carpeta de un respaldo`,
    );
  }
  validarRespaldo(origen);

  const fecha = datos.ahora?.() ?? new Date();
  const sello = fecha.toISOString().replace(/[:.]/g, '-');
  let copiaPrevia: string | null = null;
  if (existsSync(datos.rutaDb)) {
    copiaPrevia = `${datos.rutaDb}.antes-de-restaurar-${sello}`;
    try {
      const actual = new Database(datos.rutaDb);
      try {
        await actual.backup(copiaPrevia);
      } finally {
        actual.close();
      }
    } catch {
      // Si la base actual está corrupta, igual se conserva el archivo antes de restaurar.
      copyFileSync(datos.rutaDb, copiaPrevia);
    }
    chmodSync(copiaPrevia, 0o600);
  }

  mkdirSync(dirname(datos.rutaDb), { recursive: true });
  copyFileSync(origen, datos.rutaDb);
  chmodSync(datos.rutaDb, 0o600);
  for (const sufijo of ['-wal', '-shm']) {
    const archivo = `${datos.rutaDb}${sufijo}`;
    if (existsSync(archivo)) rmSync(archivo);
  }

  let incluyeClaveSii = false;
  const claveOrigen = join(datos.respaldo, NOMBRE_CLAVE);
  if (datos.rutaClaveSii && existsSync(claveOrigen)) {
    mkdirSync(dirname(datos.rutaClaveSii), { recursive: true, mode: 0o700 });
    copyFileSync(claveOrigen, datos.rutaClaveSii);
    chmodSync(datos.rutaClaveSii, 0o600);
    incluyeClaveSii = true;
  }

  return { copiaPrevia, incluyeClaveSii };
}
