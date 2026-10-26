import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { calcularTotalesDocumento } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import type { LineaParaDte, VentaParaDte } from '../tipos.js';
import { generarDte, NS_SII } from './documento.js';
import { parsearCaf } from './caf.js';
import {
  codificarEnvioLatin1,
  generarEnvioBoleta,
  MAX_BOLETAS_POR_ENVIO,
  RUT_RECEPTOR_SII,
  type DatosEnvioBoleta,
} from './envio.js';
import type { DocumentoGenerado, EmisorDte } from './tipos.js';
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
  direccion: 'AV. SIEMPRE VIVA 123',
  comuna: 'SANTIAGO',
};

const CERTIFICADO = { certificadoPem: CERTIFICADO_PEM, clavePrivadaPem: CLAVE_PRIVADA_PEM };

const AHORA = new Date('2026-10-25T18:37:31-03:00');

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

function ventaDe(tipo: 39 | 41): VentaParaDte {
  const lineas = tipo === 39 ? [lineaAfecta] : [lineaExenta];
  return {
    ventaId: `v-${tipo}`,
    numeroVenta: 42,
    fecha: AHORA,
    medioPago: 'EFECTIVO',
    entrega: 'IMPRESA',
    lineas,
    totales: calcularTotalesDocumento(
      lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.montoClp })),
    ),
  };
}

function dte(tipo: 39 | 41, folio: number): DocumentoGenerado {
  const caf = parsearCaf(generarCafPrueba({ tipoDte: tipo }).xml);
  return generarDte({
    venta: ventaDe(tipo),
    emisor: EMISOR,
    caf,
    folio,
    certificado: CERTIFICADO,
    idDocumento: `T${tipo}F${folio}`,
    ahora: AHORA,
  });
}

function enviar(
  documentos: readonly DocumentoGenerado[],
  extras: Partial<DatosEnvioBoleta> = {},
): ReturnType<typeof generarEnvioBoleta> {
  return generarEnvioBoleta({
    rutEmisor: EMISOR.rut,
    rutEnvia: EMISOR.rut,
    documentos,
    fchResol: '2026-01-01',
    nroResol: 80,
    certificado: CERTIFICADO,
    ahora: AHORA,
    ...extras,
  });
}

function dteFalso(folio: number, contenido = ''): DocumentoGenerado {
  return {
    tipoDte: 39,
    folio,
    ted: '',
    xml: `<DTE version="1.0" xmlns="${NS_SII}"><Documento ID="T39F${folio}">${contenido}</Documento></DTE>`,
  };
}

function sha1Base64(texto: string): string {
  return createHash('sha1').update(Buffer.from(texto, 'utf8')).digest('base64');
}

function bloqueFirmaSetDte(xml: string): string {
  const cierre = '</SetDTE>';
  const i = xml.indexOf(cierre);
  if (i < 0) throw new Error('EnvioBOLETA sin SetDTE');
  return xml.slice(i + cierre.length);
}

function verificarFirmaSetDte(xml: string): void {
  const set = /<SetDTE ID="([^"]+)">([\s\S]*?)<\/SetDTE>/.exec(xml);
  const id = set?.[1];
  const contenido = set?.[2];
  const firma = bloqueFirmaSetDte(xml);
  const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(firma)?.[1];
  const sig = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firma)?.[1];
  if (!id || contenido === undefined || !digest || !sig) throw new Error('SetDTE sin firma');

  const canonico = `<SetDTE xmlns="${NS_SII}" ID="${id}">${contenido}</SetDTE>`;
  expect(digest).toBe(sha1Base64(canonico));
  const ok = verify(
    'RSA-SHA1',
    Buffer.from(signedInfoCanonico(id, digest), 'utf8'),
    createPublicKey(CERTIFICADO_PEM),
    Buffer.from(sig, 'base64'),
  );
  expect(ok).toBe(true);
}

function verificarFirmaDteIncrustado(xml: string): void {
  const doc = /<Documento ID="([^"]*)">([\s\S]*?)<\/Documento>/.exec(xml);
  const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)?.[1];
  const sig = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)?.[1];
  const id = doc?.[1];
  const contenido = doc?.[2];
  if (!id || contenido === undefined || !digest || !sig) throw new Error('DTE sin firma');

  const canonico = `<Documento xmlns="${NS_SII}" ID="${id}">${contenido}</Documento>`;
  expect(digest).toBe(sha1Base64(canonico));
  const ok = verify(
    'RSA-SHA1',
    Buffer.from(signedInfoCanonico(id, digest), 'utf8'),
    createPublicKey(CERTIFICADO_PEM),
    Buffer.from(sig, 'base64'),
  );
  expect(ok).toBe(true);
}

describe('generarEnvioBoleta', () => {
  it('genera la carátula, los subtotales y los DTE sin xmlns redundante', () => {
    const envio = enviar([dte(39, 10), dte(41, 11)]);

    expect(envio.cantidad).toBe(2);
    expect(envio.nombreArchivo).toBe('boleta-2026-10-25-10.xml');
    expect(envio.xml).toMatch(
      /^<\?xml version="1\.0" encoding="ISO-8859-1"\?><EnvioBOLETA version="1\.0" xmlns="http:\/\/www\.sii\.cl\/SiiDte">/,
    );
    expect(envio.xml).toContain(
      '<SetDTE ID="SetDoc"><Caratula version="1.0">' +
        '<RutEmisor>76086428-5</RutEmisor><RutEnvia>76086428-5</RutEnvia>' +
        `<RutReceptor>${RUT_RECEPTOR_SII}</RutReceptor>` +
        '<FchResol>2026-01-01</FchResol><NroResol>80</NroResol>' +
        '<TmstFirmaEnv>2026-10-25T18:37:31</TmstFirmaEnv>' +
        '<SubTotDTE><TpoDTE>39</TpoDTE><NroDTE>1</NroDTE></SubTotDTE>' +
        '<SubTotDTE><TpoDTE>41</TpoDTE><NroDTE>1</NroDTE></SubTotDTE>' +
        '</Caratula>',
    );
    expect(envio.xml).toContain('<DTE version="1.0">');
    expect(envio.xml).not.toContain(`<DTE version="1.0" xmlns="${NS_SII}">`);
    expect(envio.xml).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(envio.xml.endsWith('</EnvioBOLETA>')).toBe(true);
  });

  it('firma el SetDTE con un digest sobre su forma canónica', () => {
    const envio = enviar([dte(39, 10)]);
    verificarFirmaSetDte(envio.xml);
  });

  it('mantiene válida la firma del DTE al incrustarlo', () => {
    const envio = enviar([dte(39, 10)]);
    verificarFirmaDteIncrustado(envio.xml);
  });

  it('no emite etiquetas autocerradas (C14N las expande y rompería el digest)', () => {
    const envio = enviar([dte(39, 10)]);
    expect(envio.xml).not.toContain('/>');
  });

  it('genera un solo SubTotDTE cuando todas las boletas son del mismo tipo', () => {
    const envio = enviar([dte(39, 10), dte(39, 11)]);
    expect(envio.xml).toContain('<SubTotDTE><TpoDTE>39</TpoDTE><NroDTE>2</NroDTE></SubTotDTE>');
    expect(envio.xml).not.toContain('<TpoDTE>41</TpoDTE>');
  });

  it('respeta el id del SetDTE y el nombre del archivo', () => {
    const envio = enviar([dte(39, 10)], {
      idSetDte: 'Lote1',
      nombreArchivo: 'lote-1.xml',
    });
    expect(envio.xml).toContain('<SetDTE ID="Lote1">');
    expect(envio.xml).toContain('<Reference URI="#Lote1">');
    expect(envio.nombreArchivo).toBe('lote-1.xml');
    verificarFirmaSetDte(envio.xml);
  });

  it('rechaza un envío vacío', () => {
    expect(() => enviar([])).toThrow(expect.objectContaining({ codigo: 'ENVIO_SIN_DOCUMENTOS' }));
  });

  it(`rechaza más de ${MAX_BOLETAS_POR_ENVIO} boletas`, () => {
    const documentos = Array.from({ length: MAX_BOLETAS_POR_ENVIO + 1 }, (_, i) => dteFalso(i + 1));
    expect(() => enviar(documentos)).toThrow(
      expect.objectContaining({ codigo: 'ENVIO_MUY_GRANDE' }),
    );
  });

  it('rechaza un folio no positivo', () => {
    expect(() => enviar([dteFalso(0)])).toThrow(
      expect.objectContaining({ codigo: 'FOLIO_INVALIDO' }),
    );
  });

  it('rechaza folios repetidos en el mismo envío', () => {
    expect(() => enviar([dteFalso(10), dteFalso(10)])).toThrow(
      expect.objectContaining({ codigo: 'ENVIO_FOLIO_DUPLICADO' }),
    );
  });

  it('rechaza un DTE con una forma inesperada', () => {
    const roto: DocumentoGenerado = { tipoDte: 39, folio: 1, ted: '', xml: '<DTE>roto</DTE>' };
    expect(() => enviar([roto])).toThrow(expect.objectContaining({ codigo: 'DTE_INVALIDO' }));
  });

  it('rechaza una fecha de resolución inexistente', () => {
    expect(() => enviar([dteFalso(1)], { fchResol: '2026-02-30' })).toThrow(
      expect.objectContaining({ codigo: 'FCH_RESOL_INVALIDA' }),
    );
    expect(() => enviar([dteFalso(1)], { fchResol: '2026-1-1' })).toThrow(
      expect.objectContaining({ codigo: 'FCH_RESOL_INVALIDA' }),
    );
  });

  it('rechaza un número de resolución fuera de rango', () => {
    expect(() => enviar([dteFalso(1)], { nroResol: -1 })).toThrow(
      expect.objectContaining({ codigo: 'NRO_RESOL_INVALIDO' }),
    );
    expect(() => enviar([dteFalso(1)], { nroResol: 1_000_000 })).toThrow(
      expect.objectContaining({ codigo: 'NRO_RESOL_INVALIDO' }),
    );
    expect(() => enviar([dteFalso(1)], { nroResol: 1.5 })).toThrow(
      expect.objectContaining({ codigo: 'NRO_RESOL_INVALIDO' }),
    );
  });

  it('rechaza un id de SetDTE que no es xs:ID', () => {
    expect(() => enviar([dteFalso(1)], { idSetDte: '1Lote' })).toThrow(
      expect.objectContaining({ codigo: 'ID_SET_DTE_INVALIDO' }),
    );
  });

  it('rechaza caracteres que no se pueden representar en ISO-8859-1', () => {
    expect(() => enviar([dteFalso(1, '🍺')])).toThrow(
      expect.objectContaining({ codigo: 'CARACTER_NO_LATIN1' }),
    );
  });
});

describe('codificarEnvioLatin1', () => {
  it('codifica los acentos en ISO-8859-1', () => {
    const bytes = codificarEnvioLatin1('<NmbItem>Pan añejo</NmbItem>');
    expect(bytes.toString('latin1')).toBe('<NmbItem>Pan añejo</NmbItem>');
    expect(bytes.includes(0xf1)).toBe(true);
  });

  it('rechaza caracteres fuera de Latin-1', () => {
    expect(() => codificarEnvioLatin1('🍺')).toThrow(
      expect.objectContaining({ codigo: 'CARACTER_NO_LATIN1' }),
    );
  });
});
