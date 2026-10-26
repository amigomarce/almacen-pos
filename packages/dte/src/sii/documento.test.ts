import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import { calcularTotalesDocumento } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import type { LineaParaDte, VentaParaDte } from '../tipos.js';
import { generarDte } from './documento.js';
import { parsearCaf } from './caf.js';
import type { EmisorDte } from './tipos.js';
import {
  CERTIFICADO_PEM,
  CLAVE_PRIVADA_PEM,
  generarCafPrueba,
  signedInfoCanonico,
} from './test/ayudas.js';

const EMISOR: EmisorDte = {
  rut: '76.086.428-5',
  razonSocial: 'ALMACEN DE PRUEBA',
  giro: 'VENTA AL POR MENOR',
  acteco: '471100',
  direccion: 'AV. SIEMPRE VIVA 123',
  comuna: 'SANTIAGO',
};

const CERTIFICADO = { certificadoPem: CERTIFICADO_PEM, clavePrivadaPem: CLAVE_PRIVADA_PEM };

const lineaAfecta: LineaParaDte = {
  nombre: 'Bebida cola 1,5 L',
  unidad: 'UN',
  cantidadMilli: 2000,
  precioUnitarioClp: 595,
  montoClp: 1190,
  tipoImpuesto: 'AFECTO',
};

const lineaExenta: LineaParaDte = {
  nombre: 'Pan corriente',
  unidad: 'KG',
  cantidadMilli: 1000,
  precioUnitarioClp: 1800,
  montoClp: 1800,
  tipoImpuesto: 'EXENTO',
};

function venta(lineas: LineaParaDte[]): VentaParaDte {
  return {
    ventaId: 'v1',
    numeroVenta: 42,
    fecha: new Date(2026, 9, 25, 18, 37, 31),
    medioPago: 'EFECTIVO',
    entrega: 'IMPRESA',
    lineas,
    totales: calcularTotalesDocumento(
      lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.montoClp })),
    ),
  };
}

function generar(lineas: LineaParaDte[], caf = parsearCaf(generarCafPrueba().xml), folio = 10) {
  return generarDte({
    venta: venta(lineas),
    emisor: EMISOR,
    caf,
    folio,
    certificado: CERTIFICADO,
    idDocumento: 'T39F10',
    ahora: new Date(2026, 9, 25, 18, 37, 31),
  });
}

function verificarTED(xml: string, clavePublica: KeyObject): void {
  const dd = /<DD>([\s\S]*?)<\/DD>/.exec(xml)?.[1];
  const frmt = /<FRMT[^>]*>([^<]+)<\/FRMT>/.exec(xml)?.[1];
  if (!dd || !frmt) throw new Error('DTE sin TED');
  const ok = verify(
    'RSA-SHA1',
    Buffer.from(`<DD>${dd}</DD>`, 'latin1'),
    clavePublica,
    Buffer.from(frmt, 'base64'),
  );
  expect(ok).toBe(true);
}

function verificarFirmaDTE(xml: string): void {
  const doc = /<Documento ID="([^"]*)">([\s\S]*?)<\/Documento>/.exec(xml);
  const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)?.[1];
  const sig = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)?.[1];
  const id = doc?.[1];
  const contenido = doc?.[2];
  if (!id || !contenido || !digest || !sig) throw new Error('DTE sin firma');

  const documentoXml = `<Documento ID="${id}">${contenido}</Documento>`;
  expect(digest).toBe(
    createHash('sha1').update(Buffer.from(documentoXml, 'utf8')).digest('base64'),
  );
  const ok = verify(
    'RSA-SHA1',
    Buffer.from(signedInfoCanonico(id, digest), 'utf8'),
    createPublicKey(CERTIFICADO_PEM),
    Buffer.from(sig, 'base64'),
  );
  expect(ok).toBe(true);
}

describe('generarDte (boleta 39/41)', () => {
  it('genera y firma una boleta afecta (39)', () => {
    const { xml, clavePublica } = generarCafPrueba({ tipoDte: 39, desde: 1, hasta: 20 });
    const caf = parsearCaf(xml);
    const generado = generar([lineaAfecta], caf, 10);

    expect(generado.tipoDte).toBe(39);
    expect(generado.folio).toBe(10);
    expect(generado.xml).toContain('<DTE version="1.0">');
    expect(generado.xml).toContain('<Documento ID="T39F10">');
    expect(generado.xml).toContain(
      '<TipoDTE>39</TipoDTE><Folio>10</Folio><FchEmis>2026-10-25</FchEmis>',
    );
    expect(generado.xml).toContain(
      '<MntNeto>1000</MntNeto><TasaIVA>19</TasaIVA><IVA>190</IVA><MntTotal>1190</MntTotal>',
    );
    expect(generado.xml).toContain('<NmbItem>Bebida cola 1,5 L</NmbItem>');
    expect(generado.xml).toContain('<TmstFirma>2026-10-25T18:37:31</TmstFirma>');
    expect(generado.xml).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(generado.xml).toContain(generado.ted);

    verificarTED(generado.xml, clavePublica);
    verificarFirmaDTE(generado.xml);
  });

  it('genera una boleta exenta (41) sin IVA', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 41 }).xml);
    const generado = generar([lineaExenta], caf);

    expect(generado.tipoDte).toBe(41);
    expect(generado.xml).toContain('<TipoDTE>41</TipoDTE>');
    expect(generado.xml).toContain('<MntExe>1800</MntExe><MntTotal>1800</MntTotal>');
    expect(generado.xml).not.toContain('<MntNeto>');
    expect(generado.xml).toContain('<IndExe>1</IndExe>');
    expect(generado.xml).toContain('<UnmdItem>KGS</UnmdItem>');
  });

  it('genera una boleta mixta (39 con línea exenta)', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 39 }).xml);
    const generado = generar([lineaAfecta, lineaExenta], caf);

    expect(generado.tipoDte).toBe(39);
    expect(generado.xml).toContain(
      '<MntNeto>1000</MntNeto><MntExe>1800</MntExe><TasaIVA>19</TasaIVA><IVA>190</IVA><MntTotal>2990</MntTotal>',
    );
    expect(generado.xml).toContain('<IndExe>1</IndExe>');
  });

  it('rechaza un CAF de otro tipo de documento', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 41 }).xml);
    expect(() => generar([lineaAfecta], caf)).toThrow(
      expect.objectContaining({ codigo: 'CAF_TIPO_DISTINTO' }),
    );
  });

  it('rechaza un folio fuera del rango del CAF', () => {
    const caf = parsearCaf(generarCafPrueba({ desde: 1, hasta: 20 }).xml);
    expect(() => generar([lineaAfecta], caf, 21)).toThrow(
      expect.objectContaining({ codigo: 'FOLIO_FUERA_DE_RANGO' }),
    );
  });

  it('rechaza un RUT de emisor inválido', () => {
    const caf = parsearCaf(generarCafPrueba().xml);
    expect(() =>
      generarDte({
        venta: venta([lineaAfecta]),
        emisor: { ...EMISOR, rut: 'no-es-rut' },
        caf,
        folio: 10,
        certificado: CERTIFICADO,
        idDocumento: 'T39F10',
      }),
    ).toThrow(expect.objectContaining({ codigo: 'RUT_INVALIDO' }));
  });
});
