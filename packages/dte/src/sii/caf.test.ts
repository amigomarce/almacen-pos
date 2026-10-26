import { describe, expect, it } from 'vitest';
import { parsearCaf } from './caf.js';
import { generarCafPrueba } from './test/ayudas.js';

describe('parsearCaf', () => {
  it('lee los datos del CAF', () => {
    const { xml } = generarCafPrueba({ tipoDte: 39, desde: 10, hasta: 50 });
    const caf = parsearCaf(xml);
    expect(caf).toMatchObject({
      rut: '76.086.428-5',
      razonSocial: 'ALMACEN DE PRUEBA',
      tipoDte: 39,
      folioDesde: 10,
      folioHasta: 50,
      fechaAutorizacion: '2026-01-01',
      idk: 100,
    });
    expect(caf.xmlCaf).toContain('<CAF version="1.0">');
    expect(caf.xmlCaf).toContain('<FRMA algoritmo="SHA1withRSA">');
    expect(caf.clavePrivadaPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('acepta un CAF indentado (lo aplana)', () => {
    const { xml } = generarCafPrueba();
    const indentado = xml.replace(/></g, '>\n<');
    const caf = parsearCaf(indentado);
    expect(caf.folioDesde).toBe(1);
    expect(caf.xmlCaf).not.toContain('\n');
  });

  it('rechaza un tipo de documento que no es boleta', () => {
    const { xml } = generarCafPrueba();
    const con33 = xml.replace('<TD>39</TD>', '<TD>33</TD>');
    expect(() => parsearCaf(con33)).toThrow(/Tipo de documento no soportado/);
  });

  it('rechaza un rango de folios inválido', () => {
    const { xml } = generarCafPrueba();
    const mal = xml.replace('<H>100</H>', '<H>0</H>');
    expect(() => parsearCaf(mal)).toThrow(/Rango de folios inválido/);
  });

  it('rechaza un CAF sin clave privada', () => {
    const { xml } = generarCafPrueba();
    const sinClave = xml.replace(/<RSASK>[\s\S]*?<\/RSASK>/, '');
    expect(() => parsearCaf(sinClave)).toThrow(
      expect.objectContaining({ codigo: 'CAF_SIN_CLAVE' }),
    );
  });

  it('rechaza texto que no es un CAF', () => {
    expect(() => parsearCaf('<nada/>')).toThrow(
      expect.objectContaining({ codigo: 'CAF_INVALIDO' }),
    );
  });
});
