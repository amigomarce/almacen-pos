import { describe, expect, it } from 'vitest';
import { parsearFormato, separarFormatoDelNombre, textoFormato } from './formato.js';

describe('parsearFormato', () => {
  it.each([
    ['500g', '500 g', 'G', 500],
    ['150 gr', '150 g', 'G', 150],
    ['25 grs.', '25 g', 'G', 25],
    ['250 gramos', '250 g', 'G', 250],
    ['428.0 g', '428 g', 'G', 428],
    ['1 kilo', '1 kg', 'G', 1000],
    ['1,5 kg', '1,5 kg', 'G', 1500],
    ['1000 ml', '1 L', 'ML', 1000],
    ['350 cc', '350 ml', 'ML', 350],
    ['200 c.c.', '200 ml', 'ML', 200],
    ['33 cl', '330 ml', 'ML', 330],
    ['1 litro', '1 L', 'ML', 1000],
    ['1.5 L', '1,5 L', 'ML', 1500],
    ['2,25 lts', '2,25 L', 'ML', 2250],
    ['1.000 ml', '1 L', 'ML', 1000], // punto como separador de miles
    ['cont. neto: 200 g', '200 g', 'G', 200],
    ['16 oz (453 g)', '453 g', 'G', 453], // se ignoran onzas si hay unidad métrica
    ['6 x 330 ml', '6 x 330 ml', 'ML', 1980],
    ['4x125g', '4 x 125 g', 'G', 500],
    ['12 unidades', '12 un', 'UN', 12],
    ['6 huevos', '6 un', 'UN', 6],
  ])('%s → %s', (entrada, texto, unidad, cantidad) => {
    expect(parsearFormato(entrada)).toEqual({ texto, unidad, cantidad });
  });

  it.each(['', '135', '16 oz', '8 porciones', '0 g', 'grande'])('no entiende «%s»', (e) => {
    expect(parsearFormato(e)).toBeNull();
  });
});

describe('textoFormato', () => {
  it('usa kg y L desde mil, con coma decimal', () => {
    expect(textoFormato('G', 999)).toBe('999 g');
    expect(textoFormato('G', 1250)).toBe('1,25 kg');
    expect(textoFormato('ML', 3000)).toBe('3 L');
    expect(textoFormato('UN', 3)).toBe('3 un');
  });
});

describe('separarFormatoDelNombre', () => {
  it('saca el formato del final del nombre', () => {
    expect(separarFormatoDelNombre('Leche Entera 1L')).toEqual({
      nombre: 'Leche Entera',
      formato: { texto: '1 L', unidad: 'ML', cantidad: 1000 },
    });
    expect(separarFormatoDelNombre('Bebida (6x350cc)').nombre).toBe('Bebida');
    expect(separarFormatoDelNombre('Atún lomitos - 160 g').nombre).toBe('Atún lomitos');
  });

  it('no toca nombres sin formato al final o que son solo formato', () => {
    expect(separarFormatoDelNombre('7 Up')).toEqual({ nombre: '7 Up', formato: null });
    expect(separarFormatoDelNombre('Galletas 7 cereales')).toEqual({
      nombre: 'Galletas 7 cereales',
      formato: null,
    });
    expect(separarFormatoDelNombre('500 g').formato).toBeNull();
  });
});
