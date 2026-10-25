import { describe, expect, it } from 'vitest';
import {
  agregarProducto,
  cambiarCantidad,
  CARRITO_VACIO,
  contarArticulos,
  lineaSeleccionada,
  moverSeleccion,
  quitarLinea,
  sumarUnidades,
  totalLocal,
} from './carrito.js';

const cola = {
  productoId: 'p1',
  nombre: 'Bebida cola',
  unidad: 'UN' as const,
  precioUnitarioClp: 1890,
};
const tomate = {
  productoId: 'p2',
  nombre: 'Tomate',
  unidad: 'KG' as const,
  precioUnitarioClp: 1490,
};

describe('carrito', () => {
  it('escanear de nuevo un producto por unidad suma a su línea', () => {
    let c = agregarProducto(CARRITO_VACIO, cola, 1000, 'a');
    c = agregarProducto(c, tomate, 1250, 'b');
    c = agregarProducto(c, { ...cola, precioUnitarioClp: 1990 }, 2000, 'c');
    expect(c.lineas).toHaveLength(2);
    expect(c.lineas[0]).toMatchObject({ clave: 'a', cantidadMilli: 3000, precioUnitarioClp: 1990 });
    expect(c.seleccionada).toBe('a');
  });

  it('los productos por peso van siempre en líneas separadas', () => {
    let c = agregarProducto(CARRITO_VACIO, tomate, 500, 'a');
    c = agregarProducto(c, tomate, 700, 'b');
    expect(c.lineas.map((l) => l.cantidadMilli)).toEqual([500, 700]);
    expect(c.seleccionada).toBe('b');
  });

  it('cambia la cantidad, suma y resta unidades; en 0 quita la línea', () => {
    let c = agregarProducto(CARRITO_VACIO, cola, 1000, 'a');
    c = sumarUnidades(c, 'a', 1);
    expect(c.lineas[0]?.cantidadMilli).toBe(2000);
    c = cambiarCantidad(c, 'a', 5000);
    expect(c.lineas[0]?.cantidadMilli).toBe(5000);
    c = sumarUnidades(c, 'a', -5);
    expect(c.lineas).toHaveLength(0);
    expect(c.seleccionada).toBeNull();
  });

  it('sumar unidades no aplica a productos por peso ni a líneas inexistentes', () => {
    const c = agregarProducto(CARRITO_VACIO, tomate, 500, 'a');
    expect(sumarUnidades(c, 'a', 1)).toBe(c);
    expect(sumarUnidades(c, 'x', 1)).toBe(c);
  });

  it('al quitar la línea seleccionada, selecciona la vecina', () => {
    let c = agregarProducto(CARRITO_VACIO, cola, 1000, 'a');
    c = agregarProducto(c, tomate, 500, 'b');
    c = agregarProducto(c, tomate, 600, 'c');
    c = moverSeleccion(c, -1); // b
    expect(quitarLinea(c, 'b').seleccionada).toBe('c');
    expect(quitarLinea(c, 'a').seleccionada).toBe('b');
    expect(quitarLinea(moverSeleccion(c, 5), 'c').seleccionada).toBe('b');
    expect(quitarLinea(c, 'x')).toBe(c);
  });

  it('mueve la selección dentro de los límites', () => {
    let c = agregarProducto(CARRITO_VACIO, cola, 1000, 'a');
    c = agregarProducto(c, tomate, 500, 'b');
    expect(moverSeleccion(c, -1).seleccionada).toBe('a');
    expect(moverSeleccion(c, -9).seleccionada).toBe('a');
    expect(moverSeleccion(c, 9).seleccionada).toBe('b');
    expect(moverSeleccion({ ...c, seleccionada: null }, -1).seleccionada).toBe('a');
    expect(moverSeleccion(CARRITO_VACIO, 1)).toBe(CARRITO_VACIO);
    expect(lineaSeleccionada(c)?.clave).toBe('b');
    expect(lineaSeleccionada(CARRITO_VACIO)).toBeNull();
  });

  it('total local y artículos', () => {
    let c = agregarProducto(CARRITO_VACIO, cola, 2000, 'a');
    c = agregarProducto(c, tomate, 1250, 'b');
    expect(totalLocal(c)).toBe(3780 + 1863);
    expect(contarArticulos(c)).toBe(3);
  });
});
