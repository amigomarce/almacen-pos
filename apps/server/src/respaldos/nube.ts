import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorDominio } from '@almacen/core';
import { leerConfiguracion } from '../configuracion/servicio.js';
import type { Db } from '../db/client.js';
import { obtenerIdentidad } from '../sincronizacion/identidad.js';
import { claveRespaldoDesdeBase64, leerClaveRespaldo } from './cifrado.js';
import { crearPaqueteCifrado, extraerPaqueteCifrado } from './paquete.js';
import {
  actualizarManifiestoRespaldo,
  listarRespaldos,
  restaurarRespaldo,
  type LoggerRespaldos,
  type RespaldoInfo,
} from './servicio.js';

type Fetch = typeof fetch;

/** Límite conservador del plan free de Supabase Storage (50 MB por objeto). */
export const MAX_BYTES_RESPALDO_NUBE = 45 * 1024 * 1024;
export const INTERVALO_NUBE_MS = 15 * 60_000;

export interface OpcionesRespaldoNube {
  db: Db;
  /** Carpeta de respaldos locales. */
  dir: string;
  /** Clave local que cifra el paquete (no se sube). */
  rutaClave: string;
  rutaDb: string;
  rutaClaveSii?: string;
  fetchFn?: Fetch;
  ahora?: () => Date;
  log?: LoggerRespaldos;
}

export interface RespaldoNube {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string | null;
}

const sinBarra = (url: string) => url.replace(/\/+$/, '');

function tokenDispositivo(db: Db): string {
  return obtenerIdentidad(db).deviceToken;
}

function baseNube(db: Db): string {
  const url = leerConfiguracion(db).cloudUrl;
  if (!url) {
    throw new ErrorDominio('NUBE_URL_REQUERIDA', 'Configura la dirección de la nube');
  }
  return sinBarra(url);
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sube el respaldo local más reciente (cifrado) a la nube. Solo actúa si el dueño habilitó
 * el respaldo remoto y configuró la URL. Es idempotente: si el manifiesto ya dice `subidoEn`,
 * no vuelve a subir el mismo respaldo.
 */
export async function subirUltimoRespaldo(
  opciones: OpcionesRespaldoNube,
): Promise<RespaldoInfo | null> {
  const config = leerConfiguracion(opciones.db);
  if (!config.cloudBackupEnabled || !config.cloudUrl) return null;

  const [ultimo] = listarRespaldos(opciones.dir);
  if (!ultimo) return null;
  if (ultimo.nube?.subidoEn && !ultimo.nube.error) return null;

  const ahora = opciones.ahora ?? (() => new Date());
  const fecha = ahora();
  const clave = leerClaveRespaldo(opciones.rutaClave);
  try {
    const paquete = await crearPaqueteCifrado(join(opciones.dir, ultimo.nombre), clave);
    if (paquete.datos.length > MAX_BYTES_RESPALDO_NUBE) {
      throw new ErrorDominio(
        'RESPALDO_MUY_GRANDE',
        `El respaldo cifrado pesa ${Math.round(paquete.datos.length / 1024 / 1024)} MB; el máximo de la nube es ${MAX_BYTES_RESPALDO_NUBE / 1024 / 1024} MB`,
      );
    }

    const params = new URLSearchParams({
      filename: `${ultimo.nombre}.apos`,
      sha256: paquete.sha256,
      createdAt: ultimo.creadoEn.toISOString(),
      retention: String(config.cloudBackupRetention),
    });
    const res = await (opciones.fetchFn ?? fetch)(
      `${sinBarra(config.cloudUrl)}/backups?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenDispositivo(opciones.db)}`,
          'content-type': 'application/octet-stream',
        },
        body: paquete.datos,
      },
    );
    if (!res.ok) {
      const texto = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
      throw new ErrorDominio(
        'NUBE_RESPALDO_FALLIDO',
        `La nube respondió ${res.status}${texto ? `: ${texto}` : ''}`,
      );
    }
    const subido = (await res.json()) as { id?: string; objeto?: string };
    if (!subido.id) {
      throw new ErrorDominio('NUBE_RESPUESTA_INVALIDA', 'La nube no devolvió el id del respaldo');
    }
    const estado = {
      subidoEn: fecha.toISOString(),
      id: subido.id,
      ...(subido.objeto ? { objeto: subido.objeto } : {}),
      sha256: paquete.sha256,
    };
    actualizarManifiestoRespaldo(opciones.dir, ultimo.nombre, { nube: estado });
    return { ...ultimo, nube: estado };
  } catch (error) {
    actualizarManifiestoRespaldo(opciones.dir, ultimo.nombre, {
      nube: { error: mensaje(error), intentoEn: fecha.toISOString() },
    });
    throw error;
  }
}

/** Ciclo de reintento del respaldo remoto; no solapa pasadas. */
export function iniciarRespaldoNube(
  opciones: OpcionesRespaldoNube & { intervaloMs?: number; log: LoggerRespaldos },
): () => void {
  let enCurso = false;
  const pasada = async (): Promise<void> => {
    if (enCurso) return;
    enCurso = true;
    try {
      const subido = await subirUltimoRespaldo(opciones);
      if (subido?.nube?.subidoEn) {
        opciones.log.info({ respaldo: subido.nombre }, 'Respaldo cifrado subido a la nube');
      }
    } catch (error) {
      opciones.log.error({ err: error }, 'No se pudo subir el respaldo a la nube');
    } finally {
      enCurso = false;
    }
  };
  void pasada();
  const timer = setInterval(() => {
    void pasada();
  }, opciones.intervaloMs ?? INTERVALO_NUBE_MS);
  return () => {
    clearInterval(timer);
  };
}

/** Lista los respaldos del dispositivo en la nube (para restaurar desde consola). */
export async function listarRespaldosNube(
  db: Db,
  opciones: { fetchFn?: Fetch } = {},
): Promise<RespaldoNube[]> {
  const res = await (opciones.fetchFn ?? fetch)(`${baseNube(db)}/backups/caja`, {
    headers: { authorization: `Bearer ${tokenDispositivo(db)}` },
  });
  if (!res.ok) {
    throw new ErrorDominio('NUBE_RESPALDO_FALLIDO', `La nube respondió ${res.status}`);
  }
  const datos = (await res.json()) as { respaldos?: RespaldoNube[] };
  return datos.respaldos ?? [];
}

/** Descarga el paquete cifrado de la nube. */
export async function descargarRespaldoNube(
  db: Db,
  id: string,
  opciones: { fetchFn?: Fetch } = {},
): Promise<Buffer> {
  const res = await (opciones.fetchFn ?? fetch)(
    `${baseNube(db)}/backups/caja/${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${tokenDispositivo(db)}` } },
  );
  if (!res.ok) {
    throw new ErrorDominio('NUBE_RESPALDO_FALLIDO', `La nube respondió ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Restaura un respaldo remoto con la caja detenida: descarga, descifra con `respaldo.key`,
 * extrae y reemplaza la base. La copia de seguridad previa la hace `restaurarRespaldo`.
 */
export async function restaurarDesdeNube(
  opciones: OpcionesRespaldoNube & { id: string; claveBase64?: string },
): Promise<{ copiaPrevia: string | null; incluyeClaveSii: boolean }> {
  const clave = opciones.claveBase64
    ? claveRespaldoDesdeBase64(opciones.claveBase64)
    : leerClaveRespaldo(opciones.rutaClave);
  const datos = await descargarRespaldoNube(opciones.db, opciones.id, {
    ...(opciones.fetchFn ? { fetchFn: opciones.fetchFn } : {}),
  });
  const temporal = mkdtempSync(join(tmpdir(), 'almacen-restauracion-'));
  try {
    await extraerPaqueteCifrado(datos, clave, temporal);
    return await restaurarRespaldo({
      respaldo: temporal,
      rutaDb: opciones.rutaDb,
      ...(opciones.rutaClaveSii ? { rutaClaveSii: opciones.rutaClaveSii } : {}),
      ...(opciones.ahora ? { ahora: opciones.ahora } : {}),
    });
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}
