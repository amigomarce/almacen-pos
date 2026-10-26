import {
  CONFIG_BALANZA_POR_DEFECTO,
  ErrorDominio,
  formatearRut,
  type ConfigBalanza,
} from '@almacen/core';
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
  /** `false` hasta que el dueño confirme la modalidad en el primer arranque. */
  boletaConfirmada: boolean;
  /** Resolución que autoriza la emisión (se imprime en la boleta válida). */
  siiFchResol: string | null;
  siiNroResol: number | null;
  /** `true` con MOCK: la caja debe mostrar "MODO PRUEBA – no emite boletas". */
  modoPrueba: boolean;
  cashRoundingEnabled: boolean;
  /** Prefijos de balanza (20–29) cuyas etiquetas traen precio; el resto trae peso. */
  prefijosBalanzaPrecio: string[];
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
  prefijosBalanzaPrecio?: string[];
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
  boletaConfirmada: f.dteProviderConfirmed,
  siiFchResol: f.siiFchResol,
  siiNroResol: f.siiNroResol,
  modoPrueba: f.dteProvider === 'MOCK',
  cashRoundingEnabled: f.cashRoundingEnabled,
  prefijosBalanzaPrecio: f.scalePricePrefixes
    ? f.scalePricePrefixes.split(',').filter(Boolean)
    : [],
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
  /** `true` si hay certificado vigente y al menos un CAF con folios. */
  siiListo: boolean;
}

export function actualizarConfiguracion(
  db: Db,
  cambios: CambiosConfiguracion,
  { permitirModoPrueba, siiListo }: OpcionesEdicion,
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
    if (cambios.dteProvider === 'SII_DIRECTO' && !siiListo) {
      throw new ErrorDominio(
        'SII_NO_CONFIGURADO',
        'Antes de emitir desde la caja carga el certificado digital y un CAF vigente',
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
    const razonSocial = textoOpcional(cambios.razonSocial);
    const giro = textoOpcional(cambios.giro);
    const direccion = textoOpcional(cambios.direccion);
    const comuna = textoOpcional(cambios.comuna);
    const proveedor = cambios.dteProvider ?? antes.dteProvider;
    const legal = {
      rut: rut !== undefined ? rut : antes.rut,
      razonSocial: razonSocial !== undefined ? razonSocial : antes.razonSocial,
      giro: giro !== undefined ? giro : antes.giro,
      direccion: direccion !== undefined ? direccion : antes.direccion,
      comuna: comuna !== undefined ? comuna : antes.comuna,
    };
    if (
      proveedor === 'SII_DIRECTO' &&
      (!legal.rut || !legal.razonSocial || !legal.giro || !legal.direccion || !legal.comuna)
    ) {
      throw new ErrorDominio(
        'DATOS_LOCAL_INCOMPLETOS',
        'Para emitir desde la caja completa el RUT, la razón social, el giro, la dirección y la comuna',
      );
    }
    const valores = {
      rut,
      razonSocial,
      giro,
      direccion,
      comuna,
      modeloEmision: cambios.modeloEmision,
      dteProvider: cambios.dteProvider,
      dteProviderConfirmed: cambios.dteProvider === undefined ? undefined : true,
      cashRoundingEnabled: cambios.cashRoundingEnabled,
      scalePricePrefixes:
        cambios.prefijosBalanzaPrecio === undefined
          ? undefined
          : [...new Set(cambios.prefijosBalanzaPrecio)].sort().join(',') || null,
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

/** Cómo leer las etiquetas de balanza según la configuración del local. */
export function configBalanzaDe(c: Configuracion): ConfigBalanza {
  const precio = new Set(c.prefijosBalanzaPrecio);
  return {
    ...CONFIG_BALANZA_POR_DEFECTO,
    prefijos: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => `2${i}`).map((p) => [
        p,
        precio.has(p) ? 'PRECIO' : 'PESO',
      ]),
    ),
  };
}
