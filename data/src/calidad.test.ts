import { describe, expect, it } from 'vitest';
import { calcularCalidad, type DatosCalidad } from './calidad.js';

const completo: DatosCalidad = {
  origen: 'TAG_CHILE',
  tieneNombre: true,
  tieneMarca: true,
  tieneFormato: true,
  viaCategoria: 'ETIQUETA',
  tieneImagen: true,
};

describe('calcularCalidad', () => {
  it('una ficha completa de Chile vale 100', () => {
    expect(calcularCalidad(completo)).toBe(100);
  });

  it('suma por campo y la categoría adivinada vale la mitad', () => {
    expect(calcularCalidad({ ...completo, tieneImagen: false })).toBe(90);
    expect(calcularCalidad({ ...completo, viaCategoria: 'PALABRA' })).toBe(90);
    expect(calcularCalidad({ ...completo, viaCategoria: 'FUENTE' })).toBe(90);
    expect(calcularCalidad({ ...completo, viaCategoria: 'NINGUNA', tieneFormato: false })).toBe(60);
    expect(
      calcularCalidad({
        origen: 'TAG_CHILE',
        tieneNombre: false,
        tieneMarca: false,
        tieneFormato: false,
        viaCategoria: 'NINGUNA',
        tieneImagen: false,
      }),
    ).toBe(0);
  });

  it('solo prefijo 780 vale la mitad; curado siempre 100', () => {
    expect(calcularCalidad({ ...completo, origen: 'PREFIJO_780' })).toBe(50);
    expect(calcularCalidad({ ...completo, origen: 'PREFIJO_780', viaCategoria: 'PALABRA' })).toBe(
      45,
    );
    expect(calcularCalidad({ ...completo, origen: 'CURADO', tieneImagen: false })).toBe(100);
  });
});
