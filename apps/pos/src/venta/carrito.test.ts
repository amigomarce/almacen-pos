import { describe, expect, it } from 'vitest';
import {
  agregarMontoLibre,
  agregarPorMonto,
  agregarProducto,
  aPedido,
  cambiarCantidad,
  cambiarMonto,
  montoLocal,
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

describe('monto fijo y monto libre', () => {
  const pan = { productoId: 'pan', nombre: 'Pan', unidad: 'KG' as const, precioUnitarioClp: 1990 };

  it('"$1.000 de pan": peso estimado, monto exacto', () => {
    const c = agregarPorMonto(CARRITO_VACIO, pan, 1000, 'a');
    expect(c.lineas[0]).toMatchObject({ cantidadMilli: 503, montoFijoClp: 1000 });
    expect(totalLocal(c)).toBe(1000);
    expect(aPedido(c.lineas)).toEqual([
      { productoId: 'pan', cantidadMilli: 503, montoFijoClp: 1000 },
    ]);
  });

  it('cambiar a peso quita el monto; cambiar a monto lo pone', () => {
    let c = agregarPorMonto(CARRITO_VACIO, pan, 1000, 'a');
    c = cambiarCantidad(c, 'a', 750);
    expect(c.lineas[0]).not.toHaveProperty('montoFijoClp');
    const linea = c.lineas[0];
    expect(linea && montoLocal(linea)).toBe(1493);
    c = cambiarMonto(c, 'a', 2000);
    expect(c.lineas[0]).toMatchObject({ cantidadMilli: 1005, montoFijoClp: 2000 });
  });

  it('cambiarMonto no aplica a productos por unidad', () => {
    const c = agregarProducto(CARRITO_VACIO, { ...pan, unidad: 'UN' }, 1000, 'a');
    expect(cambiarMonto(c, 'a', 500).lineas[0]).not.toHaveProperty('montoFijoClp');
  });

  it('monto libre: línea sin producto, y el pedido lleva nombre y precio', () => {
    let c = agregarMontoLibre(CARRITO_VACIO, '  ', 1500, 'a');
    c = agregarMontoLibre(c, 'Bolsa', 50, 'b');
    expect(c.lineas.map((l) => l.nombre)).toEqual(['Varios', 'Bolsa']);
    expect(totalLocal(c)).toBe(1550);
    expect(aPedido(c.lineas)[0]).toEqual({
      productoId: null,
      cantidadMilli: 1000,
      nombre: 'Varios',
      unidad: 'UN',
      precioUnitarioClp: 1500,
    });
  });

  it('un producto por unidad con monto fijo no se junta con otro', () => {
    const huevo = {
      productoId: 'h',
      nombre: 'Huevo',
      unidad: 'UN' as const,
      precioUnitarioClp: 250,
    };
    let c = agregarProducto(CARRITO_VACIO, huevo, 1000, 'a');
    c = { ...c, lineas: c.lineas.map((l) => ({ ...l, montoFijoClp: 1 })) };
    c = agregarProducto(c, huevo, 1000, 'b');
    expect(c.lineas).toHaveLength(2);
  });
});
