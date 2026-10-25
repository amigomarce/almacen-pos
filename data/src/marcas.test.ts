import { describe, expect, it } from 'vitest';
import { CatalogoMarcas } from './marcas.js';

function catalogo(variantes: Record<string, number>, canonicas: string[] = []): CatalogoMarcas {
  const c = new CatalogoMarcas(canonicas);
  for (const [v, n] of Object.entries(variantes)) for (let i = 0; i < n; i++) c.agregar(v);
  return c;
}

describe('CatalogoMarcas', () => {
  it('elige la variante más usada que esté bien capitalizada', () => {
    const c = catalogo({ Soprole: 268, soprole: 12 });
    expect(c.canonica('SOPROLE')).toBe('Soprole');
    const d = catalogo({ 'LONCO LECHE': 300, 'Lonco Leche': 80 });
    expect(d.canonica('lonco leche')).toBe('Lonco Leche');
  });

  it('la lista canónica manda sobre la mayoría', () => {
    const c = catalogo({ Colun: 155, COLUN: 46, Colún: 5 }, ['Colún']);
    expect(c.canonica('colun')).toBe('Colún');
    expect(c.canonica('Colun')).toBe('Colún');
  });

  it('corrige marcas que solo aparecen en mayúsculas o minúsculas', () => {
    const c = catalogo({ 'FRUTOS DEL MAIPO': 3, 'receta del abuelo': 2, PF: 4 });
    expect(c.canonica('FRUTOS DEL MAIPO')).toBe('Frutos del Maipo');
    expect(c.canonica('receta del abuelo')).toBe('Receta del Abuelo');
    expect(c.canonica('PF')).toBe('PF');
  });

  it('una marca nunca vista se limpia igual y vacío queda vacío', () => {
    const c = new CatalogoMarcas();
    expect(c.canonica('Nestlé.')).toBe('Nestlé');
    expect(c.canonica('  ')).toBe('');
  });
});
