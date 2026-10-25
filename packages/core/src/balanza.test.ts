import { describe, expect, it } from 'vitest';
import {
  CONFIG_BALANZA_POR_DEFECTO,
  decodificarCodigoBalanza,
  type ConfigBalanza,
} from './balanza.js';
import { calcularDigitoGtin } from './codigo-barras.js';

/** Completa 12 dígitos con su verificador. */
const conDv = (doce: string): string => `${doce}${calcularDigitoGtin(doce)}`;

describe('decodificarCodigoBalanza (config por defecto: peso en gramos)', () => {
  it('lee producto y peso', () => {
    // 20 | 01234 | 01250 → 1,250 kg
    expect(decodificarCodigoBalanza(conDv('200123401250'))).toEqual({
      ok: true,
      prefijo: '20',
      codigoProducto: '01234',
      tipo: 'PESO',
      pesoGramos: 1250,
    });
  });

  it('acepta todos los prefijos 20–29', () => {
    for (let p = 20; p <= 29; p++) {
      const r = decodificarCodigoBalanza(conDv(`${p}0000100500`));
      expect(r.ok && r.prefijo).toBe(String(p));
    }
  });

  it('peso máximo 99.999 g', () => {
    const r = decodificarCodigoBalanza(conDv('209999999999'));
    expect(r).toMatchObject({ ok: true, codigoProducto: '99999', pesoGramos: 99999 });
  });

  it('ignora espacios', () => {
    expect(decodificarCodigoBalanza(` ${conDv('200123401250')} `).ok).toBe(true);
  });

  it('rechaza dígito verificador malo', () => {
    const bueno = conDv('200123401250');
    const malo = `${bueno.slice(0, 12)}${(Number(bueno[12]) + 1) % 10}`;
    expect(decodificarCodigoBalanza(malo)).toEqual({ ok: false, error: 'DIGITO_VERIFICADOR' });
  });

  it.each(['', '7800000000009', '200123401250', '2001234012500X', '20012340125021'])(
    'rechaza formato "%s"',
    (c) => {
      expect(decodificarCodigoBalanza(c)).toEqual({ ok: false, error: 'FORMATO' });
    },
  );

  it('rechaza valor cero', () => {
    expect(decodificarCodigoBalanza(conDv('200123400000'))).toEqual({
      ok: false,
      error: 'VALOR_CERO',
    });
  });
});

describe('decodificarCodigoBalanza (config personalizada)', () => {
  const config: ConfigBalanza = {
    prefijos: { '21': 'PESO', '25': 'PRECIO' },
    digitosCodigo: 4,
  };

  it('prefijo de precio', () => {
    // 25 | 0042 | 003490 → $3.490
    expect(decodificarCodigoBalanza(conDv('250042003490'), config)).toEqual({
      ok: true,
      prefijo: '25',
      codigoProducto: '0042',
      tipo: 'PRECIO',
      precioClp: 3490,
    });
  });

  it('prefijo de peso con 4 dígitos de código', () => {
    expect(decodificarCodigoBalanza(conDv('210042000750'), config)).toMatchObject({
      codigoProducto: '0042',
      pesoGramos: 750,
    });
  });

  it('prefijo no configurado', () => {
    expect(decodificarCodigoBalanza(conDv('200042000750'), config)).toEqual({
      ok: false,
      error: 'PREFIJO_NO_CONFIGURADO',
    });
  });

  it.each([0, 10, 2.5])('digitosCodigo=%s es configuración inválida', (d) => {
    expect(
      decodificarCodigoBalanza(conDv('200123401250'), {
        ...CONFIG_BALANZA_POR_DEFECTO,
        digitosCodigo: d,
      }),
    ).toEqual({ ok: false, error: 'CONFIG' });
  });
});
