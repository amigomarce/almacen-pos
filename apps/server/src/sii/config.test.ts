import { generateKeyPairSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { abrirDb } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import { cafRanges, storeSettings } from '../db/schema.js';
import { generarCafPrueba } from '@almacen/dte/test';
import { CERTIFICADO, CLAVE_SII, DATOS_LOCAL, baseSii } from '../test/sii.js';
import {
  guardarCafSii,
  guardarCredencialesSii,
  leerCredencialesSii,
  resumenSii,
  siiListo,
} from './config.js';

const CREDENCIALES = {
  ...CERTIFICADO,
  rutEnvia: DATOS_LOCAL.rut,
  fchResol: '2026-01-01',
  nroResol: 80,
  ambiente: 'certificacion' as const,
};

describe('credenciales del SII', () => {
  it('guarda cifrado y devuelve los datos al leer', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    db.insert(storeSettings).values(DATOS_LOCAL).run();

    const guardadas = guardarCredencialesSii(db, CREDENCIALES, CLAVE_SII);
    expect(guardadas).toMatchObject({
      ambiente: 'certificacion',
      rutEnvia: '76086428-5',
      fchResol: '2026-01-01',
      nroResol: 80,
    });
    expect(guardadas.certificado.certificadoPem).toContain('BEGIN CERTIFICATE');
    expect(guardadas.certificadoHasta.getTime()).toBeGreaterThan(Date.now());

    const fila = db.select().from(storeSettings).get();
    expect(fila?.siiCredenciales).toMatch(/^v1:/);
    expect(fila?.siiCredenciales).not.toContain('BEGIN CERTIFICATE');
    expect(fila?.siiCredenciales).not.toContain('PRIVATE KEY');

    const leidas = leerCredencialesSii(db, CLAVE_SII);
    expect(leidas?.certificado.certificadoPem).toBe(CERTIFICADO.certificadoPem);
    expect(leidas?.certificado.clavePrivadaPem).toBe(CERTIFICADO.clavePrivadaPem);
    expect(leidas?.rutEnvia).toBe('76086428-5');
  });

  it('devuelve null si todavía no hay credenciales', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    expect(leerCredencialesSii(db, CLAVE_SII)).toBeNull();
  });

  it('rechaza un certificado que no es X.509', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    expect(() =>
      guardarCredencialesSii(db, { ...CREDENCIALES, certificadoPem: 'no-es-pem' }, CLAVE_SII),
    ).toThrow(expect.objectContaining({ codigo: 'CERTIFICADO_INVALIDO' }));
  });

  it('rechaza una clave privada que no es PEM', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    expect(() =>
      guardarCredencialesSii(db, { ...CREDENCIALES, clavePrivadaPem: 'no-es-pem' }, CLAVE_SII),
    ).toThrow(expect.objectContaining({ codigo: 'CLAVE_PRIVADA_INVALIDA' }));
  });

  it('rechaza una clave que no corresponde al certificado', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otra = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    expect(() =>
      guardarCredencialesSii(db, { ...CREDENCIALES, clavePrivadaPem: otra }, CLAVE_SII),
    ).toThrow(expect.objectContaining({ codigo: 'CERTIFICADO_CLAVE_NO_COINCIDE' }));
  });

  it('rechaza datos de envío inválidos', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    expect(() =>
      guardarCredencialesSii(db, { ...CREDENCIALES, rutEnvia: 'no-es-rut' }, CLAVE_SII),
    ).toThrow(expect.objectContaining({ codigo: 'RUT_INVALIDO' }));
    expect(() =>
      guardarCredencialesSii(db, { ...CREDENCIALES, fchResol: '2026-02-30' }, CLAVE_SII),
    ).toThrow(expect.objectContaining({ codigo: 'FCH_RESOL_INVALIDA' }));
    expect(() =>
      guardarCredencialesSii(db, { ...CREDENCIALES, nroResol: 1_000_000 }, CLAVE_SII),
    ).toThrow(expect.objectContaining({ codigo: 'NRO_RESOL_INVALIDO' }));
  });

  it('detecta un certificado vencido al leer', () => {
    const { db } = baseSii();
    db.update(storeSettings)
      .set({ siiCertificadoHasta: new Date(Date.now() - 86_400_000) })
      .where(eq(storeSettings.id, 1))
      .run();

    expect(() => leerCredencialesSii(db, CLAVE_SII)).toThrow(
      expect.objectContaining({ codigo: 'CERTIFICADO_VENCIDO' }),
    );
    expect(siiListo(db)).toBe(false);
  });

  it('falla si la clave local ya no descifra las credenciales', () => {
    const { db } = baseSii();
    expect(() => leerCredencialesSii(db, Buffer.alloc(32, 9))).toThrow(
      expect.objectContaining({ codigo: 'SECRETO_SII_INVALIDO' }),
    );
  });
});

describe('CAF y estado del SII', () => {
  it('guarda el CAF cifrado y no expone el XML', () => {
    const { db, caf39 } = baseSii();
    expect(caf39.tipoDte).toBe(39);
    const filas = db.select().from(cafRanges).all();
    expect(filas).toHaveLength(2);
    expect(filas[0]?.xmlEncrypted).toMatch(/^v1:/);
    expect(filas[0]?.xmlEncrypted).not.toContain('<CAF');
    expect(filas[0]?.nextFolio).toBe(1);
  });

  it('rechaza un CAF de otro emisor', () => {
    const { db } = baseSii();
    const otro = generarCafPrueba({
      tipoDte: 39,
      desde: 200,
      hasta: 300,
      rut: '11111111-1',
    }).xml;
    expect(() => guardarCafSii(db, otro, CLAVE_SII)).toThrow(
      expect.objectContaining({ codigo: 'CAF_OTRO_EMISOR' }),
    );
  });

  it('rechaza un rango de folios superpuesto', () => {
    const { db } = baseSii();
    const cruce = generarCafPrueba({ tipoDte: 39, desde: 50, hasta: 150 }).xml;
    expect(() => guardarCafSii(db, cruce, CLAVE_SII)).toThrow(
      expect.objectContaining({ codigo: 'CAF_SUPERPUESTO' }),
    );
  });

  it('rechaza un CAF inválido', () => {
    const { db } = baseSii();
    expect(() => guardarCafSii(db, '<AUTORIZACION/>', CLAVE_SII)).toThrow(
      expect.objectContaining({ codigo: 'CAF_INVALIDO' }),
    );
  });

  it('está listo solo con datos legales, certificado vigente y folios', () => {
    const { db } = baseSii();
    expect(siiListo(db)).toBe(true);

    db.update(cafRanges).set({ nextFolio: 101 }).where(eq(cafRanges.dteType, 39)).run();
    db.update(cafRanges).set({ nextFolio: 511 }).where(eq(cafRanges.dteType, 41)).run();
    expect(siiListo(db)).toBe(false);
  });

  it('no está listo sin los datos legales del local', () => {
    const db = abrirDb(':memory:');
    migrar(db);
    guardarCredencialesSii(db, CREDENCIALES, CLAVE_SII);
    guardarCafSii(db, generarCafPrueba({ tipoDte: 39 }).xml, CLAVE_SII);
    expect(siiListo(db)).toBe(false);
  });

  it('resume el estado sin exponer secretos', () => {
    const { db } = baseSii();
    const resumen = resumenSii(db);
    expect(resumen).toMatchObject({
      listo: true,
      ambiente: 'certificacion',
      cafs: [
        { tipoDte: 39, desde: 1, hasta: 100, siguiente: 1, disponibles: 100 },
        { tipoDte: 41, desde: 500, hasta: 510, siguiente: 500, disponibles: 11 },
      ],
    });
    expect(resumen.certificadoHasta).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(resumen)).not.toContain('BEGIN');
  });
});
