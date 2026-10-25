import { describe, expect, it } from 'vitest';
import { ErrorDominio } from './errores.js';
import { calcularSubtotalLinea, calcularVenta, type LineaVentaEntrada } from './venta.js';

const linea = (o: Partial<LineaVentaEntrada> = {}): LineaVentaEntrada => ({
  productoId: 'p1',
  nombre: 'Bebida 1,5 L',
  unidad: 'UN',
  cantidadMilli: 1000,
  precioUnitarioClp: 1000,
  tipoImpuesto: 'AFECTO',
  ...o,
});

describe('calcularSubtotalLinea', () => {
  it.each([
    [3000, 1290, 3870], // 3 unidades
    [1250, 2990, 3738], // 1,25 kg × $2.990 = 3.737,5 → 3.738
    [333, 1000, 333],
    [1, 1, 0], // 1 g de algo a $1/kg
    [500, 1, 1], // 0,5 → 1 (half-up)
  ])('%i milésimas × $%i = $%i', (q, p, esperado) => {
    expect(calcularSubtotalLinea(q, p)).toBe(esperado);
  });
});

describe('calcularVenta: sin promociones', () => {
  it('venta vacía', () => {
    const r = calcularVenta([]);
    expect(r.totalClp).toBe(0);
    expect(r.lineas).toEqual([]);
  });

  it('suma líneas por unidad y por kg', () => {
    const r = calcularVenta([
      linea({ cantidadMilli: 2000, precioUnitarioClp: 1290 }),
      linea({
        productoId: 'pan',
        nombre: 'Pan',
        unidad: 'KG',
        cantidadMilli: 750,
        precioUnitarioClp: 1990,
      }),
    ]);
    expect(r.lineas.map((l) => l.totalLineaClp)).toEqual([2580, 1493]);
    expect(r.totalClp).toBe(4073);
    expect(r.totales.totalClp).toBe(4073);
    expect(r.descuentoTotalClp).toBe(0);
  });

  it('venta rápida sin producto', () => {
    const r = calcularVenta([
      linea({ productoId: null, nombre: 'Varios', precioUnitarioClp: 500 }),
    ]);
    expect(r.totalClp).toBe(500);
  });

  it('descuento manual', () => {
    const r = calcularVenta([linea({ precioUnitarioClp: 1290, descuentoManualClp: 290 })]);
    expect(r.lineas[0]).toMatchObject({
      subtotalClp: 1290,
      descuentoManualClp: 290,
      totalLineaClp: 1000,
    });
    expect(r.descuentoTotalClp).toBe(290);
  });

  it('mezcla afecto y exento', () => {
    const r = calcularVenta([
      linea({ precioUnitarioClp: 1190 }),
      linea({ productoId: 'x', tipoImpuesto: 'EXENTO', precioUnitarioClp: 300 }),
    ]);
    expect(r.totales).toMatchObject({ netoClp: 1000, ivaClp: 190, exentoClp: 300, totalClp: 1490 });
  });

  it('precio $0 permitido (regalo)', () => {
    expect(calcularVenta([linea({ precioUnitarioClp: 0 })]).totalClp).toBe(0);
  });
});

describe('calcularVenta: validaciones', () => {
  it.each<[string, Partial<LineaVentaEntrada>, string]>([
    ['cantidad 0', { cantidadMilli: 0 }, 'CANTIDAD_INVALIDA'],
    ['cantidad negativa', { cantidadMilli: -1000 }, 'CANTIDAD_INVALIDA'],
    ['fracción en producto por unidad', { cantidadMilli: 1500 }, 'CANTIDAD_FRACCIONARIA'],
    ['precio negativo', { precioUnitarioClp: -1 }, 'PRECIO_NEGATIVO'],
    ['nombre vacío', { nombre: '  ' }, 'NOMBRE_VACIO'],
    ['descuento negativo', { descuentoManualClp: -1 }, 'DESCUENTO_INVALIDO'],
    ['descuento mayor al subtotal', { descuentoManualClp: 1001 }, 'DESCUENTO_INVALIDO'],
    ['cantidad no entera', { cantidadMilli: 1000.5 }, 'NO_ENTERO'],
    ['precio no entero', { precioUnitarioClp: 99.9 }, 'NO_ENTERO'],
    ['descuento no entero', { descuentoManualClp: 0.5 }, 'NO_ENTERO'],
  ])('%s', (_, cambio, codigo) => {
    expect(() => calcularVenta([linea(cambio)])).toThrow(
      expect.objectContaining({ codigo }) as ErrorDominio,
    );
  });
});

describe('calcularVenta: promociones "N x $P"', () => {
  const promo = { productoId: 'p1', cantidadPack: 2, precioPackClp: 1500 };

  it.each([
    [1, 1000, 0],
    [2, 1500, 500],
    [3, 2500, 500], // la tercera a precio normal
    [4, 3000, 1000],
    [5, 4000, 1000],
  ])('%i unidades a $1.000 con 2x$1.500 → $%i', (n, total, descuento) => {
    const r = calcularVenta([linea({ cantidadMilli: n * 1000 })], [promo]);
    expect(r.totalClp).toBe(total);
    expect(r.lineas[0]?.descuentoPromoClp).toBe(descuento);
    expect(r.descuentoTotalClp).toBe(descuento);
  });

  it('suma unidades de varias líneas del mismo producto', () => {
    const r = calcularVenta([linea(), linea({ nombre: 'otra' }), linea()], [promo]);
    expect(r.totalClp).toBe(2500);
    expect(r.lineas.map((l) => l.descuentoPromoClp)).toEqual([500, 0, 0]);
  });

  it('reparte el descuento si no cabe en una línea', () => {
    // 3 x $1.000 con 3x$300: descuento 2.700 → 1.000 + 1.000 + 700
    const r = calcularVenta(
      [linea(), linea(), linea()],
      [{ productoId: 'p1', cantidadPack: 3, precioPackClp: 300 }],
    );
    expect(r.lineas.map((l) => l.descuentoPromoClp)).toEqual([1000, 1000, 700]);
    expect(r.totalClp).toBe(300);
  });

  it('no deja líneas en negativo con descuento manual previo', () => {
    // 2 x $1.000, manual de $900 en la primera; promo 2x$100 (descuento 1.900)
    const r = calcularVenta(
      [linea({ descuentoManualClp: 900 }), linea()],
      [{ productoId: 'p1', cantidadPack: 2, precioPackClp: 100 }],
    );
    expect(r.lineas.map((l) => l.totalLineaClp)).toEqual([0, 0]);
    expect(r.lineas.every((l) => l.totalLineaClp >= 0)).toBe(true);
    expect(r.totalClp).toBe(0);
  });

  it('no aplica si el pack sale más caro que el precio normal', () => {
    const r = calcularVenta(
      [linea({ cantidadMilli: 2000 })],
      [{ productoId: 'p1', cantidadPack: 2, precioPackClp: 2500 }],
    );
    expect(r.totalClp).toBe(2000);
  });

  it('no aplica a productos por kg ni a otros productos', () => {
    const r = calcularVenta(
      [
        linea({ unidad: 'KG', cantidadMilli: 2000 }),
        linea({ productoId: 'p2', cantidadMilli: 2000 }),
      ],
      [promo],
    );
    expect(r.descuentoTotalClp).toBe(0);
  });

  it('el IVA se calcula sobre el total ya descontado', () => {
    const r = calcularVenta(
      [linea({ cantidadMilli: 2000 })],
      [{ productoId: 'p1', cantidadPack: 2, precioPackClp: 1190 }],
    );
    expect(r.totales).toMatchObject({ netoClp: 1000, ivaClp: 190 });
  });

  it.each<[string, object, string]>([
    ['pack menor a 2', { cantidadPack: 1 }, 'PROMO_INVALIDA'],
    ['pack fraccionario', { cantidadPack: 2.5 }, 'PROMO_INVALIDA'],
    ['precio negativo', { precioPackClp: -1 }, 'PROMO_INVALIDA'],
    ['precio no entero', { precioPackClp: 1.5 }, 'NO_ENTERO'],
  ])('rechaza promoción con %s', (_, cambio, codigo) => {
    expect(() => calcularVenta([linea()], [{ ...promo, ...cambio }])).toThrow(
      expect.objectContaining({ codigo }) as ErrorDominio,
    );
  });

  it('rechaza dos promociones del mismo producto', () => {
    expect(() => calcularVenta([linea()], [promo, promo])).toThrow(
      expect.objectContaining({ codigo: 'PROMO_DUPLICADA' }) as ErrorDominio,
    );
  });
});
