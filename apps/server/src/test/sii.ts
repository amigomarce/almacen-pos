import { CERTIFICADO_PEM, CLAVE_PRIVADA_PEM, generarCafPrueba } from '@almacen/dte/test';
import { abrirDb, type Db } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { storeSettings } from '../db/schema.js';
import { guardarCafSii, guardarCredencialesSii } from '../sii/config.js';

/** Clave de cifrado fija para tests (nunca se usa en una instalación real). */
export const CLAVE_SII = Buffer.alloc(32, 7);

export const CERTIFICADO = {
  certificadoPem: CERTIFICADO_PEM,
  clavePrivadaPem: CLAVE_PRIVADA_PEM,
};

export const DATOS_LOCAL = {
  rut: '76.086.428-5',
  razonSocial: 'ALMACEN DE PRUEBA',
  giro: 'VENTA AL POR MENOR',
  direccion: 'AV. SIEMPRE VIVA 123',
  comuna: 'SANTIAGO',
};

export interface BaseSii {
  db: Db;
  caf39: ReturnType<typeof guardarCafSii>;
  caf41: ReturnType<typeof guardarCafSii>;
}

/** Base en memoria con datos legales, certificado y un CAF de cada tipo ya cargados. */
export function baseSii(): BaseSii {
  const db = abrirDb(':memory:');
  migrar(db);
  db.insert(storeSettings).values(DATOS_LOCAL).run();
  guardarCredencialesSii(
    db,
    {
      ...CERTIFICADO,
      rutEnvia: DATOS_LOCAL.rut,
      fchResol: '2026-01-01',
      nroResol: 80,
      ambiente: 'certificacion',
    },
    CLAVE_SII,
  );
  const caf39 = guardarCafSii(
    db,
    generarCafPrueba({ tipoDte: 39, desde: 1, hasta: 100 }).xml,
    CLAVE_SII,
  );
  const caf41 = guardarCafSii(
    db,
    generarCafPrueba({ tipoDte: 41, desde: 500, hasta: 510 }).xml,
    CLAVE_SII,
  );
  return { db, caf39, caf41 };
}
