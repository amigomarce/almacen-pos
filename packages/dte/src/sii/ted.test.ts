import { Buffer } from 'node:buffer';
import { verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsearCaf } from './caf.js';
import { construirTed, type DatosTed } from './ted.js';
import { generarCafPrueba } from './test/ayudas.js';

function datosTed(extra: Partial<DatosTed> = {}): DatosTed {
  return {
    rutEmisor: '76086428-5',
    tipoDte: 39,
    folio: 1,
    fechaEmision: '2026-10-25',
    rutReceptor: '66666666-6',
    razonSocialReceptor: 'CLIENTE FINAL',
    montoTotal: 1190,
    primerItem: 'Bebida cola 1,5 L',
    fechaHora: '2026-10-25T18:37:31',
    ...extra,
  };
}

function firmaFrMT(xml: string): string {
  const m = /<FRMT[^>]*>([^<]+)<\/FRMT>/.exec(xml);
  if (!m?.[1]) throw new Error('sin FRMT');
  return m[1];
}

describe('TED (timbre electrónico)', () => {
  it('firma el DD aplanado con la clave del CAF (SHA1withRSA, ISO-8859-1)', () => {
    const { xml, clavePublica } = generarCafPrueba();
    const caf = parsearCaf(xml);
    const { ted, dd } = construirTed(datosTed(), caf);

    const ok = verify(
      'RSA-SHA1',
      Buffer.from(dd, 'latin1'),
      clavePublica,
      Buffer.from(firmaFrMT(ted), 'base64'),
    );
    expect(ok).toBe(true);
  });

  it('arma el DD con el orden y los campos del schema', () => {
    const caf = parsearCaf(generarCafPrueba().xml);
    const { dd } = construirTed(datosTed(), caf);
    expect(dd).toContain('<RE>76086428-5</RE>');
    expect(dd).toContain('<TD>39</TD><F>1</F><FE>2026-10-25</FE>');
    expect(dd).toContain('<RR>66666666-6</RR>');
    expect(dd).toContain('<MNT>1190</MNT>');
    expect(dd).toContain('<IT1>Bebida cola 1,5 L</IT1>');
    expect(dd).toContain('<CAF version="1.0">');
    expect(dd).toContain('<TSTED>2026-10-25T18:37:31</TSTED>');
  });

  it('recorta RSR e IT1 a 40 caracteres', () => {
    const caf = parsearCaf(generarCafPrueba().xml);
    const { dd } = construirTed(
      datosTed({
        razonSocialReceptor: 'x'.repeat(50),
        primerItem: 'y'.repeat(50),
      }),
      caf,
    );
    expect(dd).toContain('<RSR>' + 'x'.repeat(40) + '</RSR>');
    expect(dd).toContain('<IT1>' + 'y'.repeat(40) + '</IT1>');
  });

  it('rechaza un CAF de otro tipo de documento', () => {
    const caf = parsearCaf(generarCafPrueba({ tipoDte: 41 }).xml);
    expect(() => construirTed(datosTed(), caf)).toThrow(
      expect.objectContaining({ codigo: 'CAF_TIPO_DISTINTO' }),
    );
  });

  it('rechaza un CAF de otro emisor', () => {
    const caf = parsearCaf(generarCafPrueba({ rut: '11111111-1' }).xml);
    expect(() => construirTed(datosTed(), caf)).toThrow(
      expect.objectContaining({ codigo: 'CAF_OTRO_EMISOR' }),
    );
  });
});
