import { describe, expect, it } from 'vitest';
import { CARRITO_VACIO, type Carrito, type LineaCarrito } from './carrito.js';
import {
  guardarEnEspera,
  leerEnEspera,
  MAXIMO_EN_ESPERA,
  ponerEnEspera,
  retomar,
  totalEnEspera,
  type VentaEnEspera,
} from './espera.js';

const linea = (nombre: string, precio: number, clave = nombre): LineaCarrito => ({
  clave,
  productoId: `p-${nombre}`,
  nombre,
  unidad: 'UN',
  cantidadMilli: 1000,
  precioUnitarioClp: precio,
});
const carrito = (...lineas: LineaCarrito[]): Carrito => ({
  lineas,
  seleccionada: lineas.at(-1)?.clave ?? null,
});
const ahora = new Date('2026-10-29T15:00:00Z');

class AlmacenFalso {
  datos = new Map<string, string>();
  getItem(k: string) {
    return this.datos.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.datos.set(k, v);
  }
  removeItem(k: string) {
    this.datos.delete(k);
  }
}

describe('ventas en espera', () => {
  it('pone la venta en espera y deja la caja libre', () => {
    const r = ponerEnEspera([], carrito(linea('Leche', 1100)), 'e1', ahora);
    expect(r).toEqual({
      ok: true,
      carrito: CARRITO_VACIO,
      enEspera: [{ id: 'e1', guardadaEn: ahora.toISOString(), lineas: [linea('Leche', 1100)] }],
    });
  });

  it('no guarda una venta vacía ni más del máximo', () => {
    expect(ponerEnEspera([], CARRITO_VACIO, 'x')).toEqual({ ok: false, motivo: 'VACIA' });
    const llenas: VentaEnEspera[] = Array.from({ length: MAXIMO_EN_ESPERA }, (_, i) => ({
      id: `e${i}`,
      guardadaEn: '',
      lineas: [linea('Pan', 100)],
    }));
    expect(ponerEnEspera(llenas, carrito(linea('Leche', 1100)), 'x')).toEqual({
      ok: false,
      motivo: 'LLENA',
    });
  });

  it('retoma la elegida; la venta en curso queda en espera en su lugar', () => {
    const espera: VentaEnEspera[] = [
      { id: 'e1', guardadaEn: 'a', lineas: [linea('Leche', 1100)] },
      { id: 'e2', guardadaEn: 'b', lineas: [linea('Pan', 500), linea('Queso', 2000)] },
    ];
    const r = retomar(espera, carrito(linea('Bebida', 1890)), 'e2', 'e3', ahora);
    expect(r?.carrito).toEqual({ lineas: espera[1]?.lineas, seleccionada: 'Queso' });
    expect(r?.enEspera.map((v) => v.id)).toEqual(['e1', 'e3']);

    const sinCurso = retomar(espera, CARRITO_VACIO, 'e1', 'e3');
    expect(sinCurso?.enEspera.map((v) => v.id)).toEqual(['e2']);
    expect(retomar(espera, CARRITO_VACIO, 'nada', 'e3')).toBeNull();
  });

  it('total aproximado con los precios guardados', () => {
    expect(
      totalEnEspera({ id: 'e', guardadaEn: '', lineas: [linea('A', 1000), linea('B', 590)] }),
    ).toBe(1590);
  });

  it('guarda y lee del almacenamiento local, tolerando datos dañados', () => {
    const a = new AlmacenFalso();
    const ventas: VentaEnEspera[] = [{ id: 'e1', guardadaEn: 'x', lineas: [linea('Leche', 1)] }];
    guardarEnEspera(ventas, a);
    expect(leerEnEspera(a)).toEqual(ventas);
    guardarEnEspera([], a);
    expect(a.datos.size).toBe(0);
    expect(leerEnEspera(a)).toEqual([]);

    a.setItem('almacen-pos.ventas-en-espera', '{no es json');
    expect(leerEnEspera(a)).toEqual([]);
    a.setItem('almacen-pos.ventas-en-espera', JSON.stringify({ no: 'lista' }));
    expect(leerEnEspera(a)).toEqual([]);
    a.setItem('almacen-pos.ventas-en-espera', JSON.stringify([{ id: 1 }, null, ventas[0]]));
    expect(leerEnEspera(a)).toEqual(ventas);
    expect(leerEnEspera(null)).toEqual([]);
  });

  it('sin almacenamiento no falla', () => {
    const roto = {
      setItem: () => {
        throw new Error('lleno');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(() => {
      guardarEnEspera([{ id: 'e', guardadaEn: '', lineas: [linea('A', 1)] }], roto);
      guardarEnEspera([], roto);
    }).not.toThrow();
  });
});
