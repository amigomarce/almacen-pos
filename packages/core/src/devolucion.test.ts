import { describe, expect, it } from 'vitest';
import { cuadrarCaja } from './caja.js';
import { calcularDevolucion, type LineaDevolvible } from './devolucion.js';
import { ErrorDominio } from './errores.js';

const linea = (v: Partial<LineaDevolvible> & { id: string }): LineaDevolvible => ({
  cantidadMilli: 1000,
  totalLineaClp: 1000,
  devueltoMilli: 0,
  devueltoClp: 0,
  ...v,
});

describe('calcularDevolucion', () => {
  it('devuelve lo proporcional a lo pagado por la línea', () => {
    const r = calcularDevolucion(
      [linea({ id: 'a', cantidadMilli: 3000, totalLineaClp: 2390 })], // promo 3 x $2.390
      [{ lineaId: 'a', cantidadMilli: 1000 }],
      'DEBITO',
      true,
    );
    expect(r).toEqual({
      items: [{ lineaId: 'a', cantidadMilli: 1000, montoClp: 797 }],
      totalClp: 797,
      redondeoClp: 0,
      aEntregarClp: 797,
    });
  });

  it('devolver todo lo que quedaba devuelve exactamente lo que faltaba (sin restos)', () => {
    const l = linea({ id: 'a', cantidadMilli: 3000, totalLineaClp: 2390 });
    const primera = calcularDevolucion(
      [l],
      [{ lineaId: 'a', cantidadMilli: 1000 }],
      'DEBITO',
      true,
    );
    const despues = { ...l, devueltoMilli: 1000, devueltoClp: primera.totalClp };
    const resto = calcularDevolucion(
      [despues],
      [{ lineaId: 'a', cantidadMilli: 2000 }],
      'DEBITO',
      true,
    );
    expect(primera.totalClp + resto.totalClp).toBe(2390);
  });

  it('por peso: devuelve una parte de los kilos', () => {
    const r = calcularDevolucion(
      [linea({ id: 'q', cantidadMilli: 250, totalLineaClp: 2998 })],
      [{ lineaId: 'q', cantidadMilli: 100 }],
      'TRANSFERENCIA',
      true,
    );
    expect(r.totalClp).toBe(1199);
  });

  it('en efectivo redondea lo que se entrega (Ley 20.956); el total del documento es exacto', () => {
    const r = calcularDevolucion(
      [linea({ id: 'a', totalLineaClp: 1293 }), linea({ id: 'b', totalLineaClp: 1000 })],
      [
        { lineaId: 'a', cantidadMilli: 1000 },
        { lineaId: 'b', cantidadMilli: 1000 },
      ],
      'EFECTIVO',
      true,
    );
    expect(r).toMatchObject({ totalClp: 2293, redondeoClp: -3, aEntregarClp: 2290 });
    const sinRedondeo = calcularDevolucion(
      [linea({ id: 'a', totalLineaClp: 1293 })],
      [{ lineaId: 'a', cantidadMilli: 1000 }],
      'EFECTIVO',
      false,
    );
    expect(sinRedondeo.redondeoClp).toBe(0);
  });

  it('nunca devuelve más de lo pagado ni más cantidad de la que queda', () => {
    const l = linea({
      id: 'a',
      cantidadMilli: 2000,
      totalLineaClp: 1001,
      devueltoMilli: 1000,
      devueltoClp: 501,
    });
    // Lo proporcional sería 501, pero solo quedan 500 por devolver.
    expect(
      calcularDevolucion(
        [{ ...l, devueltoClp: 1000 }],
        [{ lineaId: 'a', cantidadMilli: 500 }],
        'DEBITO',
        true,
      ).totalClp,
    ).toBe(1);
    expect(() =>
      calcularDevolucion([l], [{ lineaId: 'a', cantidadMilli: 1001 }], 'DEBITO', true),
    ).toThrow('No se puede devolver más');
  });

  it.each([
    [[], 'DEVOLUCION_VACIA'],
    [[{ lineaId: 'x', cantidadMilli: 1000 }], 'LINEA_INEXISTENTE'],
    [[{ lineaId: 'a', cantidadMilli: 0 }], 'CANTIDAD_INVALIDA'],
    [[{ lineaId: 'a', cantidadMilli: 1.5 }], 'NO_ENTERO'],
    [
      [
        { lineaId: 'a', cantidadMilli: 100 },
        { lineaId: 'a', cantidadMilli: 100 },
      ],
      'LINEA_REPETIDA',
    ],
  ])('rechaza pedidos inválidos (%j → %s)', (pedido, codigo) => {
    try {
      calcularDevolucion([linea({ id: 'a' })], pedido, 'DEBITO', true);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDominio);
      expect((e as ErrorDominio).codigo).toBe(codigo);
    }
  });
});

describe('cuadratura con devoluciones', () => {
  it('las devoluciones en efectivo bajan el esperado; las otras solo se informan', () => {
    const c = cuadrarCaja(
      10000,
      [{ medioPago: 'EFECTIVO', totalClp: 5000, redondeoClp: 0, anulada: false }],
      [],
      [
        { medioPago: 'EFECTIVO', totalClp: 1293, redondeoClp: -3 },
        { medioPago: 'DEBITO', totalClp: 2000, redondeoClp: 0 },
      ],
    );
    expect(c.devoluciones).toEqual({ cantidad: 2, totalClp: 3293, efectivoClp: 1290 });
    expect(c.efectivoEsperadoClp).toBe(10000 + 5000 - 1290);
  });

  it('rechaza devoluciones con montos inválidos', () => {
    expect(() =>
      cuadrarCaja(0, [], [], [{ medioPago: 'DEBITO', totalClp: -1, redondeoClp: 0 }]),
    ).toThrow(ErrorDominio);
  });
});
