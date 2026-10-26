import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import { calcularTotalesDocumento } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import type { LineaParaDte, VentaParaDte } from '../tipos.js';
import { generarDte, NS_SII } from './documento.js';
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

function venta(lineas: LineaParaDte[]): VentaParaDte {
  return {
    ventaId: 'v1',
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

function generar(lineas: LineaParaDte[], caf = parsearCaf(generarCafPrueba().xml), folio = 10) {
  return generarDte({
    venta: venta(lineas),
    emisor: EMISOR,
    caf,
    folio,
    certificado: CERTIFICADO,
    idDocumento: 'T39F10',
    ahora: AHORA,
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

/** El digest se calcula sobre la forma canónica: el Documento hereda el namespace del DTE. */
function verificarFirmaDTE(xml: string): void {
  const doc = /<Documento ID="([^"]*)">([\s\S]*?)<\/Documento>/.exec(xml);
  const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)?.[1];
  const sig = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)?.[1];
  const id = doc?.[1];
  const contenido = doc?.[2];
  if (!id || !contenido || !digest || !sig) throw new Error('DTE sin firma');

  const documentoCanonico = `<Documento xmlns="${NS_SII}" ID="${id}">${contenido}</Documento>`;
  expect(digest).toBe(
    createHash('sha1').update(Buffer.from(documentoCanonico, 'utf8')).digest('base64'),
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
  it('genera y firma una boleta afecta (39) con la estructura del schema de boleta', () => {
    const { xml, clavePublica } = generarCafPrueba({ tipoDte: 39, desde: 1, hasta: 20 });
    const caf = parsearCaf(xml);
    const generado = generar([lineaAfecta], caf, 10);

    expect(generado.tipoDte).toBe(39);
    expect(generado.folio).toBe(10);
    expect(generado.xml).toContain(`<DTE version="1.0" xmlns="${NS_SII}">`);
    expect(generado.xml).toContain('<Documento ID="T39F10">');
    expect(generado.xml).toContain(
      '<IdDoc><TipoDTE>39</TipoDTE><Folio>10</Folio><FchEmis>2026-10-25</FchEmis><IndServicio>3</IndServicio></IdDoc>',
    );
    expect(generado.xml).toContain(
      '<Emisor><RUTEmisor>76086428-5</RUTEmisor><RznSocEmisor>ALMACEN DE PRUEBA</RznSocEmisor>' +
        '<GiroEmisor>VENTA AL POR MENOR</GiroEmisor><DirOrigen>AV. SIEMPRE VIVA 123</DirOrigen>' +
        '<CmnaOrigen>SANTIAGO</CmnaOrigen></Emisor>',
    );
    expect(generado.xml).toContain(
      '<Totales><MntNeto>1000</MntNeto><IVA>190</IVA><MntTotal>1190</MntTotal></Totales>',
    );
    expect(generado.xml).toContain(
      '<Detalle><NroLinDet>1</NroLinDet><NmbItem>Bebida cola 1,5 L</NmbItem>' +
        '<QtyItem>2</QtyItem><UnmdItem>UN</UnmdItem><PrcItem>595</PrcItem><MontoItem>1190</MontoItem></Detalle>',
    );
    expect(generado.xml).toContain('<TmstFirma>2026-10-25T18:37:31</TmstFirma>');
    expect(generado.xml).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(generado.xml).toContain(generado.ted);

    // El schema de boleta no lleva Acteco ni TasaIVA (eso es de factura).
    expect(generado.xml).not.toContain('<Acteco>');
    expect(generado.xml).not.toContain('<TasaIVA>');

    verificarTED(generado.xml, clavePublica);
    verificarFirmaDTE(generado.xml);
  });

  it('genera una boleta exenta (41) sin neto ni IVA', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 41 }).xml);
    const generado = generar([lineaExenta], caf);

    expect(generado.tipoDte).toBe(41);
    expect(generado.xml).toContain('<TipoDTE>41</TipoDTE>');
    expect(generado.xml).toContain(
      '<Totales><MntExe>1800</MntExe><MntTotal>1800</MntTotal></Totales>',
    );
    expect(generado.xml).not.toContain('<MntNeto>');
    expect(generado.xml).not.toContain('<IVA>');
    expect(generado.xml).toContain('<IndExe>1</IndExe>');
    expect(generado.xml).toContain('<UnmdItem>KG</UnmdItem>');
  });

  it('genera una boleta mixta (39 con línea exenta)', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 39 }).xml);
    const generado = generar([lineaAfecta, lineaExenta], caf);

    expect(generado.tipoDte).toBe(39);
    expect(generado.xml).toContain(
      '<Totales><MntNeto>1000</MntNeto><MntExe>1800</MntExe><IVA>190</IVA><MntTotal>2990</MntTotal></Totales>',
    );
    expect(generado.xml).toContain('<IndExe>1</IndExe>');
  });

  it('deriva PrcItem del monto de la línea (venta con descuento)', () => {
    const conDescuento: LineaParaDte = {
      nombre: 'Bebida',
      unidad: 'UN',
      cantidadMilli: 2000,
      precioUnitarioClp: 1000,
      montoClp: 1800,
      tipoImpuesto: 'AFECTO',
    };
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 39 }).xml);
    const generado = generar([conDescuento], caf);

    expect(generado.xml).toContain('<PrcItem>900</PrcItem><MontoItem>1800</MontoItem>');
  });

  it('omite PrcItem en una línea gratis (el schema no admite 0)', () => {
    const gratis: LineaParaDte = {
      nombre: 'Muestra',
      unidad: 'UN',
      cantidadMilli: 1000,
      precioUnitarioClp: 0,
      montoClp: 0,
      tipoImpuesto: 'EXENTO',
    };
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 39 }).xml);
    const generado = generar([gratis], caf);

    expect(generado.xml).toContain('<MontoItem>0</MontoItem>');
    expect(generado.xml).not.toContain('<PrcItem>');
  });

  it('recorta el nombre del ítem a 80 caracteres', () => {
    const largo: LineaParaDte = { ...lineaAfecta, nombre: 'x'.repeat(90) };
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 39 }).xml);
    const generado = generar([largo], caf);
    expect(generado.xml).toContain(`<NmbItem>${'x'.repeat(80)}</NmbItem>`);
  });

  it('rechaza un giro que supera el largo del schema', () => {
    const caf = parsearCaf(generarCafPrueba().xml);
    expect(() =>
      generarDte({
        venta: venta([lineaAfecta]),
        emisor: { ...EMISOR, giro: 'g'.repeat(81) },
        caf,
        folio: 10,
        certificado: CERTIFICADO,
        idDocumento: 'T39F10',
      }),
    ).toThrow(expect.objectContaining({ codigo: 'DATO_MUY_LARGO' }));
  });

  it('rechaza un CAF de otro emisor', () => {
    const caf = parsearCaf(generarCafPrueba({ rut: '11111111-1' }).xml);
    expect(() => generar([lineaAfecta], caf)).toThrow(
      expect.objectContaining({ codigo: 'CAF_OTRO_EMISOR' }),
    );
  });

  it('rechaza una cantidad fraccionaria en un producto por unidad', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 39 }).xml);
    expect(() => generar([{ ...lineaAfecta, cantidadMilli: 1500 }], caf)).toThrow(
      expect.objectContaining({ codigo: 'CANTIDAD_FRACCIONARIA' }),
    );
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
