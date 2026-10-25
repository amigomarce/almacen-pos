import { describe, expect, it } from 'vitest';
import { normalizarProducto } from './nombre.js';

const n = (nombre: string, marca: string, cantidad = '') =>
  normalizarProducto({ nombre, marca, cantidad }).nombre;

describe('normalizarProducto (nombre de góndola)', () => {
  it('arma Marca + Producto + Formato', () => {
    expect(n('Leche Entera', 'Colún', '1000 ml')).toBe('Colún Leche Entera 1 L');
    expect(n('Quesillo Sano y Natural', 'Quillayes', '150g')).toBe(
      'Quillayes Quesillo Sano y Natural 150 g',
    );
  });

  it('no repite la marca que ya viene en el nombre', () => {
    expect(n('Lays Jamón Serrano', "Lay's")).toBe("Lay's Jamón Serrano");
    expect(n('En Línea Mermelada de Frambuesa', 'En Línea')).toBe(
      'En Línea Mermelada de Frambuesa',
    );
    expect(n('Cholgas en agua (Cuisine & Co)', 'Cuisine & Co', '428.0 g')).toBe(
      'Cuisine & Co Cholgas en agua 428 g',
    );
  });

  it('saca el formato del nombre si el campo cantidad viene vacío o coincide', () => {
    expect(n('Leche Entera 1L', 'Colún')).toBe('Colún Leche Entera 1 L');
    expect(n('Leche Entera 1L', 'Colún', '1 litro')).toBe('Colún Leche Entera 1 L');
    // Si no coinciden, se respeta el nombre y manda el campo cantidad.
    expect(n('Pack Bebida 350cc', 'Bilz', '6 x 350 ml')).toBe('Bilz Pack Bebida 350cc 6 x 350 ml');
  });

  it('arregla nombres en MAYÚSCULAS', () => {
    expect(n('ATÚN STEAK IQF IVP', 'SeaGarden')).toBe('SeaGarden Atún Steak Iqf Ivp');
  });

  it('funciona sin marca o cuando el nombre es solo la marca', () => {
    expect(n('Harina multicereal', '', '1 kg')).toBe('Harina multicereal 1 kg');
    expect(n('Quaker', 'Quaker', '500 g')).toBe('Quaker 500 g');
  });

  it('entrega las partes por separado', () => {
    expect(
      normalizarProducto({ nombre: 'leche descremada', marca: 'Soprole', cantidad: '1 L' }),
    ).toEqual({
      nombre: 'Soprole Leche descremada 1 L',
      producto: 'Leche descremada',
      marca: 'Soprole',
      formato: { texto: '1 L', unidad: 'ML', cantidad: 1000 },
    });
  });
});
