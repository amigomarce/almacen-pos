import { describe, expect, it } from 'vitest';
import { analizarVentas, inicioPeriodo } from './analisis.js';

// 29-oct-2026 15:00 en Chile (horario de verano, UTC−3).
const ahora = new Date('2026-10-29T18:00:00Z');

const productos = [
  { id: 'p1', name: 'Bebida', unit: 'UN', costClp: 1000, stockMilli: 500 },
  { id: 'p2', name: 'Pan', unit: 'KG', costClp: null, stockMilli: 10000 },
  { id: 'p3', name: 'Leche', unit: 'UN', costClp: 800, stockMilli: 50000 },
];
const ventas = [
  // 12:30 del 29 en Chile
  {
    id: 'v1',
    createdAt: new Date('2026-10-29T15:30:00Z'),
    totalClp: 3780,
    paymentMethod: 'EFECTIVO',
  },
  // 20:30 del 28
  {
    id: 'v2',
    createdAt: new Date('2026-10-28T23:30:00Z'),
    totalClp: 1500,
    paymentMethod: 'DEBITO',
  },
  // 23:30 del 28 en Chile (ya es 29 en UTC)
  {
    id: 'v3',
    createdAt: new Date('2026-10-29T02:30:00Z'),
    totalClp: 1100,
    paymentMethod: 'EFECTIVO',
  },
];
const lineas = [
  {
    saleId: 'v1',
    productId: 'p1',
    nameSnapshot: 'Bebida',
    unit: 'UN',
    qtyMilli: 2000,
    lineTotalClp: 3780,
  },
  {
    saleId: 'v2',
    productId: 'p2',
    nameSnapshot: 'Pan',
    unit: 'KG',
    qtyMilli: 1000,
    lineTotalClp: 1500,
  },
  {
    saleId: 'v3',
    productId: 'p3',
    nameSnapshot: 'Leche',
    unit: 'UN',
    qtyMilli: 1000,
    lineTotalClp: 1100,
  },
];
const devoluciones = [
  {
    createdAt: new Date('2026-10-29T16:00:00Z'),
    refundClp: 1890,
    paymentMethod: 'EFECTIVO',
    items: [{ productId: 'p1', nameSnapshot: 'Bebida', qtyMilli: 1000, amountClp: 1890 }],
  },
];

describe('reporte del dueño', () => {
  const r = analizarVentas({ dias: 7, ahora, ventas, lineas, devoluciones, productos });

  it('el período parte a las 00:00 de Chile de hace 6 días', () => {
    expect(r.desde).toBe('2026-10-23T03:00:00.000Z');
    expect(inicioPeriodo(1, ahora).toISOString()).toBe('2026-10-29T03:00:00.000Z');
  });

  it('ventas netas y ticket promedio', () => {
    expect(r.ventas).toEqual({
      totalClp: 4490,
      cantidad: 3,
      porMedio: { EFECTIVO: 2990, DEBITO: 1500 },
      devolucionesClp: 1890,
    });
    expect(r.ticketPromedioClp).toBe(1497);
  });

  it('lo más vendido, neto de devoluciones, con su margen (costo actual)', () => {
    expect(r.masVendidos).toEqual([
      {
        productoId: 'p1',
        nombre: 'Bebida',
        unidad: 'UN',
        cantidadMilli: 1000,
        montoClp: 1890,
        margenClp: 890,
      },
      {
        productoId: 'p2',
        nombre: 'Pan',
        unidad: 'KG',
        cantidadMilli: 1000,
        montoClp: 1500,
        margenClp: null,
      },
      {
        productoId: 'p3',
        nombre: 'Leche',
        unidad: 'UN',
        cantidadMilli: 1000,
        montoClp: 1100,
        margenClp: 300,
      },
    ]);
    expect(r.margen).toEqual({
      ventasClp: 2990,
      costoClp: 1800,
      margenClp: 1190,
      porcentaje: 39.8,
      sinCostoClp: 1500,
    });
  });

  it('ventas por hora y por día en hora de Chile', () => {
    expect(r.porHora).toHaveLength(24);
    expect(r.porHora.filter((h) => h.cantidad > 0)).toEqual([
      { hora: 12, montoClp: 3780, cantidad: 1 },
      { hora: 20, montoClp: 1500, cantidad: 1 },
      { hora: 23, montoClp: 1100, cantidad: 1 },
    ]);
    expect(r.porDia.map((d) => d.fecha)).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
    expect(r.porDia.at(-2)).toEqual({ fecha: '2026-10-28', montoClp: 2600, cantidad: 2 });
    expect(r.porDia.at(-1)).toEqual({ fecha: '2026-10-29', montoClp: 1890, cantidad: 1 });
  });

  it('sugiere comprar lo que se acaba en menos de una semana', () => {
    expect(r.sugeridoCompra).toEqual([
      {
        id: 'p1',
        nombre: 'Bebida',
        unidad: 'UN',
        stockMilli: 500,
        ventaDiariaMilli: 143,
        diasDeStock: 3.5,
        sugeridoMilli: 2000,
      },
    ]);
  });

  it('sin ventas: todo en cero', () => {
    const vacio = analizarVentas({
      dias: 1,
      ahora,
      ventas: [],
      lineas: [],
      devoluciones: [],
      productos,
    });
    expect(vacio.ventas.totalClp).toBe(0);
    expect(vacio.ticketPromedioClp).toBe(0);
    expect(vacio.masVendidos).toEqual([]);
    expect(vacio.margen.porcentaje).toBeNull();
    expect(vacio.porDia).toEqual([{ fecha: '2026-10-29', montoClp: 0, cantidad: 0 }]);
    expect(vacio.sugeridoCompra).toEqual([]);
  });

  it('ventas rápidas sin producto se agrupan por nombre y no tienen margen', () => {
    const rapida = analizarVentas({
      dias: 1,
      ahora,
      ventas: [{ id: 'v', createdAt: ahora, totalClp: 300, paymentMethod: 'EFECTIVO' }],
      lineas: [
        {
          saleId: 'v',
          productId: null,
          nameSnapshot: 'Bolsa',
          unit: 'UN',
          qtyMilli: 1000,
          lineTotalClp: 100,
        },
        {
          saleId: 'v',
          productId: null,
          nameSnapshot: 'Bolsa',
          unit: 'UN',
          qtyMilli: 2000,
          lineTotalClp: 200,
        },
      ],
      devoluciones: [],
      productos,
    });
    expect(rapida.masVendidos).toEqual([
      {
        productoId: null,
        nombre: 'Bolsa',
        unidad: 'UN',
        cantidadMilli: 3000,
        montoClp: 300,
        margenClp: null,
      },
    ]);
  });
});
