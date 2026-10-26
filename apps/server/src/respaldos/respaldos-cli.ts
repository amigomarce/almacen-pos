/**
 * Respaldos de la base local.
 *
 * Uso (desde `apps/server`):
 *   pnpm respaldo:crear
 *   pnpm respaldo:listar
 *   pnpm respaldo:restaurar --respaldo var/respaldos/almacen-2026-10-25_23-10-00 --si
 *
 * Para restaurar, detén la caja primero: el comando aborta si el servidor local responde.
 * El respaldo incluye la clave del SII si existe; sin ella no se pueden descifrar las
 * credenciales de la base restaurada.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { ErrorDominio } from '@almacen/core';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { cargarEnvLocal, variable } from '../env.js';
import {
  crearRespaldo,
  listarRespaldos,
  podarRespaldos,
  restaurarRespaldo,
  type RespaldoInfo,
} from './servicio.js';

const USO = [
  'pnpm respaldo:crear',
  'pnpm respaldo:listar',
  'pnpm respaldo:restaurar --respaldo <carpeta> --si',
].join('\n');

function leerArgumentos() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        respaldo: { type: 'string' },
        si: { type: 'boolean' },
      },
    });
  } catch {
    console.error(USO);
    process.exit(1);
  }
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function imprimirRespaldo(r: RespaldoInfo): void {
  console.log(
    `  ${r.nombre} · ${formatearTamano(r.tamanoBytes)} · ${r.creadoEn.toLocaleString('es-CL')}` +
      (r.incluyeClaveSii ? ' · incluye clave SII' : ''),
  );
}

async function servidorActivo(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:3001/health', {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

cargarEnvLocal();
const { values, positionals } = leerArgumentos();
const comando = positionals[0];

const rutaDb = variable('ALMACEN_DB') ?? 'var/almacen.sqlite';
const dir = variable('ALMACEN_RESPALDOS') ?? join(dirname(rutaDb), 'respaldos');
const rutaClaveSii = variable('ALMACEN_SII_KEY') ?? 'var/sii.key';

async function ejecutar(): Promise<void> {
  switch (comando) {
    case 'crear': {
      if (rutaDb !== ':memory:' && !existsSync(rutaDb)) {
        throw new ErrorDominio('BASE_NO_ENCONTRADA', `No existe la base local: ${rutaDb}`);
      }
      const db = abrirDb(rutaDb);
      try {
        migrar(db);
        const info = await crearRespaldo(db, { dir, rutaDb, rutaClaveSii });
        const borrados = podarRespaldos(dir);
        console.log('Respaldo creado:');
        imprimirRespaldo(info);
        console.log(`Carpeta: ${join(dir, info.nombre)}`);
        if (borrados.length > 0) console.log(`Se borraron ${borrados.length} respaldos antiguos.`);
      } finally {
        db.$client.close();
      }
      return;
    }

    case 'listar': {
      const respaldos = listarRespaldos(dir);
      if (respaldos.length === 0) {
        console.log(`No hay respaldos en ${dir}.`);
        return;
      }
      console.log(`Respaldos en ${dir}:`);
      for (const r of respaldos) imprimirRespaldo(r);
      return;
    }

    case 'restaurar': {
      const respaldo = values.respaldo;
      if (!respaldo) throw new ErrorDominio('FALTA_RESPALDO', 'Indica --respaldo <carpeta>');
      if (!values.si) {
        throw new ErrorDominio(
          'CONFIRMACION_REQUERIDA',
          'Esto reemplaza la base actual. Repite con --si para confirmar.',
        );
      }
      if (await servidorActivo()) {
        throw new ErrorDominio(
          'SERVIDOR_ACTIVO',
          'La caja está corriendo en 127.0.0.1:3001. Deténla antes de restaurar.',
        );
      }
      const resultado = await restaurarRespaldo({ respaldo, rutaDb, rutaClaveSii });
      console.log('Respaldo restaurado.');
      if (resultado.copiaPrevia) console.log(`Copia de la base anterior: ${resultado.copiaPrevia}`);
      console.log(
        resultado.incluyeClaveSii
          ? 'También se restauró la clave del SII.'
          : 'La clave del SII no venía en el respaldo; se mantuvo la actual.',
      );
      return;
    }

    default:
      console.error(USO);
      process.exitCode = 1;
  }
}

try {
  await ejecutar();
} catch (error) {
  console.error(error instanceof ErrorDominio ? `${error.codigo}: ${error.message}` : error);
  process.exitCode = 1;
}
