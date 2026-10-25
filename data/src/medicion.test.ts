import { describe, expect, it } from 'vitest';
import { COLUMNAS, Medidor, crearAleatorio, esDeChile, type Fila } from './medicion.js';

function fila(parcial: Partial<Fila>): Fila {
  const base = Object.fromEntries(COLUMNAS.map((c) => [c, ''])) as Fila;
  return { ...base, countries_tags: 'en:chile', ...parcial };
}

describe('esDeChile', () => {
  it('reconoce en:chile dentro de la lista', () => {
    expect(esDeChile('en:argentina,en:chile')).toBe(true);
    expect(esDeChile('en:chilean-thing')).toBe(false);
    expect(esDeChile('')).toBe(false);
  });
});

describe('Medidor', () => {
  it('clasifica códigos y cuenta campos presentes', () => {
    const m = new Medidor(5);
    m.agregar(
      fila({
        code: '7801610001196',
        product_name: 'Leche',
        brands: 'Colún',
        quantity: '1 L',
        categories_tags: 'en:milks',
      }),
    );
    m.agregar(fila({ code: '7801610001196' })); // duplicado
    m.agregar(fila({ code: '2000000000015' })); // balanza (prefijo 20)
    m.agregar(fila({ code: '7801610001190' })); // dígito inválido
    m.agregar(fila({ code: '123' })); // formato
    m.agregar(fila({ code: '036000291452', image_url: 'http://x' })); // UPC-A válido
    m.agregar(fila({ code: '7801610001196', countries_tags: 'en:france' })); // no es de Chile

    const c = m.conteo;
    expect(c.filas).toBe(7);
    expect(c.chile).toBe(6);
    expect(c.eanValido).toBe(2);
    expect(c.eanDuplicado).toBe(1);
    expect(c.eanBalanza).toBe(1);
    expect(c.eanDigitoInvalido).toBe(1);
    expect(c.eanFormatoInvalido).toBe(1);
    expect(c.prefijoChile780).toBe(1);
    expect(c.completos).toBe(1);
    expect(c.conImagen).toBe(1);
    expect(m.muestra).toHaveLength(5);
  });

  it('el aleatorio es reproducible con la misma semilla', () => {
    const a = crearAleatorio(42);
    const b = crearAleatorio(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
