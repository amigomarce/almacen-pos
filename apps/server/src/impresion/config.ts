import { COLUMNAS_POR_ANCHO, type AnchoPapel, type PaginaCodigos } from '@almacen/printer';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { registers, TRANSPORTES_IMPRESORA, type TransporteImpresora } from '../db/schema.js';
import { ErrorHttp } from '../errores.js';
import { parsearDestinoRed } from './transportes.js';

export const PAGINAS_CODIGOS: readonly PaginaCodigos[] = ['CP858', 'CP850', 'WPC1252'];
export const ANCHOS_PAPEL: readonly AnchoPapel[] = [58, 80];

export interface ConfigImpresora {
  transporte: TransporteImpresora;
  destino: string | null;
  anchoMm: AnchoPapel;
  /** `null` = según el ancho. */
  columnas: number | null;
  paginaCodigos: PaginaCodigos;
  cortar: boolean;
  abrirCajon: boolean;
}

/** Columnas que se usan de verdad. */
export function columnasEfectivas(c: ConfigImpresora): number {
  return c.columnas ?? COLUMNAS_POR_ANCHO[c.anchoMm];
}

export function leerConfigImpresora(db: Db, registerId: string): ConfigImpresora {
  const r = db.select().from(registers).where(eq(registers.id, registerId)).get();
  if (!r) throw new ErrorHttp('CAJA_NO_ENCONTRADA', 'No hay una caja activa', 404);
  return {
    transporte: r.printerTransport,
    destino: r.printerTarget,
    anchoMm: (ANCHOS_PAPEL as readonly number[]).includes(r.printerWidthMm)
      ? (r.printerWidthMm as AnchoPapel)
      : 80,
    columnas: r.printerColumns,
    paginaCodigos: (PAGINAS_CODIGOS as readonly string[]).includes(r.printerCodepage)
      ? (r.printerCodepage as PaginaCodigos)
      : 'CP858',
    cortar: r.printerCut,
    abrirCajon: r.printerDrawer,
  };
}

export function validarConfigImpresora(c: ConfigImpresora): ConfigImpresora {
  const destino = c.destino?.trim() ? c.destino.trim() : null;
  const invalida = (mensaje: string) => new ErrorHttp('CONFIG_IMPRESORA_INVALIDA', mensaje, 400);
  if (!TRANSPORTES_IMPRESORA.includes(c.transporte)) throw invalida('Tipo de conexión desconocido');
  if (c.transporte !== 'DESACTIVADA' && !destino) {
    throw invalida(
      c.transporte === 'RED'
        ? 'Falta la dirección IP de la impresora'
        : c.transporte === 'SISTEMA'
          ? 'Falta elegir la impresora del sistema'
          : 'Falta la carpeta o el dispositivo',
    );
  }
  if (c.transporte === 'RED' && destino && !parsearDestinoRed(destino)) {
    throw invalida('La dirección debe ser como 192.168.1.50 o 192.168.1.50:9100');
  }
  return { ...c, destino };
}

export function guardarConfigImpresora(
  db: Db,
  registerId: string,
  c: ConfigImpresora,
): ConfigImpresora {
  const v = validarConfigImpresora(c);
  db.update(registers)
    .set({
      printerTransport: v.transporte,
      printerTarget: v.destino,
      printerWidthMm: v.anchoMm,
      printerColumns: v.columnas,
      printerCodepage: v.paginaCodigos,
      printerCut: v.cortar,
      printerDrawer: v.abrirCajon,
    })
    .where(eq(registers.id, registerId))
    .run();
  return leerConfigImpresora(db, registerId);
}
