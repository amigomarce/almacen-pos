import { ErrorDominio, formatearRut } from '@almacen/core';
import {
  MODALIDAD_INICIAL,
  modalidadDisponible,
  type ModeloEmision,
  type NombreProvider,
} from '@almacen/dte';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { storeSettings } from '../db/schema.js';

export interface Configuracion {
  rut: string | null;
  razonSocial: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  modeloEmision: ModeloEmision;
  /** Modalidad de boleta. */
  dteProvider: NombreProvider;
  /** `true` con MOCK: la caja debe mostrar "MODO PRUEBA – no emite boletas". */
  modoPrueba: boolean;
  cashRoundingEnabled: boolean;
  version: number;
  updatedAt: string;
}

export interface CambiosConfiguracion {
  rut?: string | null;
  razonSocial?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  modeloEmision?: ModeloEmision;
  dteProvider?: NombreProvider;
  cashRoundingEnabled?: boolean;
}

type Fila = typeof storeSettings.$inferSelect;

const aConfiguracion = (f: Fila): Configuracion => ({
  rut: f.rut,
  razonSocial: f.razonSocial,
  giro: f.giro,
  direccion: f.direccion,
  comuna: f.comuna,
  modeloEmision: f.modeloEmision,
  dteProvider: f.dteProvider,
  modoPrueba: f.dteProvider === 'MOCK',
  cashRoundingEnabled: f.cashRoundingEnabled,
  version: f.version,
  updatedAt: f.updatedAt.toISOString(),
});

/**
 * Lee la configuración del local. Si la base es nueva (instalación real, sin `db:seed`), crea
 * la fila con la modalidad inicial `PUENTE_MANUAL`, nunca `MOCK`.
 */
export function leerConfiguracion(db: Db): Configuracion {
  const fila =
    db.select().from(storeSettings).get() ??
    db.insert(storeSettings).values({ dteProvider: MODALIDAD_INICIAL }).returning().get();
  return aConfiguracion(fila);
}

const textoOpcional = (v: string | null | undefined): string | null | undefined => {
  if (v === undefined || v === null) return v;
  const t = v.trim();
  return t === '' ? null : t;
};

export interface OpcionesEdicion {
  /** `false` en producción: no se puede pasar a MOCK (no emitiría boletas). */
  permitirModoPrueba: boolean;
}

export function actualizarConfiguracion(
  db: Db,
  cambios: CambiosConfiguracion,
  { permitirModoPrueba }: OpcionesEdicion,
): { antes: Configuracion; despues: Configuracion } {
  if (cambios.dteProvider !== undefined) {
    if (!modalidadDisponible(cambios.dteProvider)) {
      throw new ErrorDominio(
        'MODALIDAD_NO_DISPONIBLE',
        'Esa modalidad de boleta todavía no está disponible',
      );
    }
    if (cambios.dteProvider === 'MOCK' && !permitirModoPrueba) {
      throw new ErrorDominio(
        'MODO_PRUEBA_NO_PERMITIDO',
        'El modo prueba solo se puede usar en desarrollo: no emite boletas',
      );
    }
  }
  let rut = textoOpcional(cambios.rut);
  if (rut) {
    const formateado = formatearRut(rut);
    if (!formateado) throw new ErrorDominio('RUT_INVALIDO', 'El RUT no es válido');
    rut = formateado;
  }

  return db.transaction(() => {
    const antes = leerConfiguracion(db);
    const valores = {
      rut,
      razonSocial: textoOpcional(cambios.razonSocial),
      giro: textoOpcional(cambios.giro),
      direccion: textoOpcional(cambios.direccion),
      comuna: textoOpcional(cambios.comuna),
      modeloEmision: cambios.modeloEmision,
      dteProvider: cambios.dteProvider,
      cashRoundingEnabled: cambios.cashRoundingEnabled,
    };
    const definidos = Object.fromEntries(
      Object.entries(valores).filter(([, v]) => v !== undefined),
    ) as Partial<Fila>;
    const fila = db
      .update(storeSettings)
      .set({ ...definidos, updatedAt: new Date(), version: antes.version + 1 })
      .where(eq(storeSettings.id, 1))
      .returning()
      .get();
    return { antes, despues: aConfiguracion(fila) };
  });
}
