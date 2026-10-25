import { calcularTotalesDocumento, ErrorDominio, MEDIOS_PAGO, type MedioPago } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import {
  LEYENDA_COMPROBANTE_INTERNO,
  MockProvider,
  PuenteManualProvider,
  requiereBoleta,
  tipoDteSegunTotales,
  validarVentaParaDte,
  type DocumentoEmitido,
  type LineaParaDte,
  type VentaParaDte,
} from './index.js';

const lineaAfecta: LineaParaDte = {
  nombre: 'Bebida',
  unidad: 'UN',
  cantidadMilli: 1000,
  precioUnitarioClp: 1190,
  montoClp: 1190,
  tipoImpuesto: 'AFECTO',
};

function venta(
  o: Partial<VentaParaDte> = {},
  lineas: LineaParaDte[] = [lineaAfecta],
): VentaParaDte {
  return {
    ventaId: 'v1',
    numeroVenta: 42,
    fecha: new Date('2026-10-25T12:00:00-03:00'),
    medioPago: 'EFECTIVO',
    entrega: 'IMPRESA',
    lineas,
    totales: calcularTotalesDocumento(
      lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.montoClp })),
    ),
    ...o,
  };
}

describe('requiereBoleta', () => {
  it.each<[MedioPago, boolean]>([
    ['EFECTIVO', true],
    ['TRANSFERENCIA', true],
    ['DEBITO', false],
    ['CREDITO', false],
  ])('SOLO_NO_ELECTRONICOS + %s → %s', (medio, esperado) => {
    expect(requiereBoleta('SOLO_NO_ELECTRONICOS', medio)).toBe(esperado);
  });

  it.each(MEDIOS_PAGO)('TODO_MEDIO_PAGO + %s → true', (medio) => {
    expect(requiereBoleta('TODO_MEDIO_PAGO', medio)).toBe(true);
  });
});

describe('tipoDteSegunTotales', () => {
  const t = (afecto: number, exento: number) =>
    calcularTotalesDocumento([
      { tipoImpuesto: 'AFECTO', montoClp: afecto },
      { tipoImpuesto: 'EXENTO', montoClp: exento },
    ]);
  it('afecta → 39', () => {
    expect(tipoDteSegunTotales(t(1000, 0))).toBe(39);
  });
  it('mixta → 39', () => {
    expect(tipoDteSegunTotales(t(1000, 500))).toBe(39);
  });
  it('solo exenta → 41', () => {
    expect(tipoDteSegunTotales(t(0, 500))).toBe(41);
  });
  it('vacía → 39', () => {
    expect(tipoDteSegunTotales(t(0, 0))).toBe(39);
  });
});

describe('validarVentaParaDte', () => {
  it('acepta una venta cuadrada', () => {
    expect(() => {
      validarVentaParaDte(venta());
    }).not.toThrow();
  });

  it('rechaza venta sin líneas', () => {
    expect(() => {
      validarVentaParaDte(venta({}, []));
    }).toThrow(expect.objectContaining({ codigo: 'VENTA_VACIA' }) as ErrorDominio);
  });

  it('rechaza líneas que no suman el total', () => {
    const v = venta();
    expect(() => {
      validarVentaParaDte({ ...v, totales: { ...v.totales, afectoClp: 999 } });
    }).toThrow(/no suman/);
  });

  it('rechaza neto + IVA descuadrado', () => {
    const v = venta();
    expect(() => {
      validarVentaParaDte({ ...v, totales: { ...v.totales, ivaClp: 191 } });
    }).toThrow(/no cuadra/);
  });

  it('rechaza total descuadrado', () => {
    const v = venta();
    expect(() => {
      validarVentaParaDte({ ...v, totales: { ...v.totales, totalClp: 1 } });
    }).toThrow(/no cuadra/);
  });
});

describe.each([
  ['MockProvider', (m?: 'TODO_MEDIO_PAGO') => new MockProvider(m)],
  ['PuenteManualProvider', (m?: 'TODO_MEDIO_PAGO') => new PuenteManualProvider(m)],
])('%s (comportamiento común)', (_, crear) => {
  it('emite un comprobante que NO es boleta', async () => {
    const r = await crear().emitirBoleta(venta());
    expect(r.emitido).toBe(true);
    if (!r.emitido) return;
    expect(r.documento).toMatchObject({
      tipoDte: null,
      folio: null,
      ted: null,
      xml: null,
      estadoSii: 'NO_APLICA',
      validoComoBoleta: false,
      entrega: 'IMPRESA',
    });
    expect(r.documento.leyendas[0]).toBe(LEYENDA_COMPROBANTE_INTERNO);
    expect(r.documento.totales.totalClp).toBe(1190);
  });

  it('respeta la entrega virtual', async () => {
    const r = await crear().emitirBoleta(venta({ entrega: 'VIRTUAL' }));
    expect(r.emitido && r.documento.entrega).toBe('VIRTUAL');
  });

  it('con tarjeta no emite: el voucher es la boleta', async () => {
    await expect(crear().emitirBoleta(venta({ medioPago: 'DEBITO' }))).resolves.toEqual({
      emitido: false,
      motivo: 'VOUCHER_ES_BOLETA',
    });
  });

  it('con TODO_MEDIO_PAGO emite también con tarjeta', async () => {
    const r = await crear('TODO_MEDIO_PAGO').emitirBoleta(venta({ medioPago: 'CREDITO' }));
    expect(r.emitido).toBe(true);
  });

  it('no emite por $0', async () => {
    const r = await crear().emitirBoleta(
      venta({}, [{ ...lineaAfecta, montoClp: 0, precioUnitarioClp: 0 }]),
    );
    expect(r).toEqual({ emitido: false, motivo: 'TOTAL_CERO' });
  });

  it('rechaza ventas descuadradas', async () => {
    const v = venta();
    await expect(
      crear().emitirBoleta({ ...v, totales: { ...v.totales, totalClp: 5 } }),
    ).rejects.toThrow(ErrorDominio);
  });

  it('no tiene nada que enviar ni consultar', async () => {
    const p = crear();
    await expect(p.enviarPendientes()).resolves.toEqual([]);
    await expect(p.consultarEstado('123')).resolves.toBe('NO_APLICA');
  });
});

describe('MockProvider', () => {
  it('imprime número de comprobante y total', async () => {
    const r = await new MockProvider().emitirBoleta(venta());
    expect(r.emitido && r.documento.leyendas[1]).toBe('Comprobante N° 42 · Total $1.190');
    expect(r.emitido && r.documento.accionCajero).toBeNull();
    expect(r.emitido && r.documento.provider).toBe('MOCK');
  });
});

describe('PuenteManualProvider', () => {
  const provider = new PuenteManualProvider();

  async function emitido(): Promise<DocumentoEmitido> {
    const r = await provider.emitirBoleta(venta());
    if (!r.emitido) throw new Error('debía emitir');
    return r.documento;
  }

  it('le pide al cajero emitir en e-Boleta por el total exacto', async () => {
    const doc = await emitido();
    expect(doc.provider).toBe('PUENTE_MANUAL');
    expect(doc.accionCajero).toBe('Emite la boleta en la app e-Boleta del SII por $1.190');
  });

  it('registra el folio externo sin mutar el original', async () => {
    const doc = await emitido();
    const conFolio = provider.registrarFolioExterno(doc, ' 000123 ');
    expect(conFolio.folioExterno).toBe('123');
    expect(conFolio.accionCajero).toBeNull();
    expect(doc.folioExterno).toBeNull();
  });

  it.each(['', 'abc', '0', '-5', '12.3', '12345678901'])('rechaza folio "%s"', async (folio) => {
    const doc = await emitido();
    expect(() => provider.registrarFolioExterno(doc, folio)).toThrow(
      expect.objectContaining({ codigo: 'FOLIO_INVALIDO' }) as ErrorDominio,
    );
  });

  it('rechaza documentos de otro provider', async () => {
    const r = await new MockProvider().emitirBoleta(venta());
    if (!r.emitido) throw new Error('debía emitir');
    expect(() => provider.registrarFolioExterno(r.documento, '1')).toThrow(
      expect.objectContaining({ codigo: 'PROVIDER_INCORRECTO' }) as ErrorDominio,
    );
  });
});
