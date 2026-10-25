import { describe, expect, it } from 'vitest';
import { deduplicar } from './deduplicar.js';
import type { Candidato } from './lector.js';

function c(p: Partial<Candidato> & Pick<Candidato, 'barcode' | 'fuente'>): Candidato {
  return {
    origen: 'TAG_CHILE',
    nombre: '',
    marca: '',
    cantidad: '',
    categoriasTags: [],
    imagen: '',
    modificado: null,
    ...p,
  };
}

describe('deduplicar', () => {
  it('deja un registro por código y respeta la prioridad curado > off > opff > obf > opf', () => {
    const r = deduplicar([
      c({ barcode: '7802930000548', fuente: 'obf', nombre: 'Nombre OBF', marca: 'Marca OBF' }),
      c({ barcode: '7802930000548', fuente: 'off', nombre: 'Nombre OFF' }),
      c({ barcode: '7802930000548', fuente: 'curado', origen: 'CURADO', cantidad: '150 g' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      fuente: 'curado',
      origen: 'CURADO',
      nombre: 'Nombre OFF', // el curado no traía nombre: se completa con la siguiente fuente
      marca: 'Marca OBF',
      cantidad: '150 g',
      fuentes: ['curado', 'off', 'obf'],
    });
  });

  it('una sola fuente con etiqueta Chile basta para el origen TAG_CHILE', () => {
    const r = deduplicar([
      c({ barcode: '7800120455062', fuente: 'off', origen: 'PREFIJO_780', nombre: 'Harina' }),
      c({ barcode: '7800120455062', fuente: 'opf', origen: 'TAG_CHILE' }),
    ]);
    expect(r[0]).toMatchObject({ origen: 'TAG_CHILE', fuente: 'off', nombre: 'Harina' });
  });

  it('en la misma fuente gana la ficha modificada más recientemente', () => {
    const r = deduplicar([
      c({ barcode: '0021000026326', fuente: 'off', nombre: 'Vieja', modificado: 100 }),
      c({ barcode: '0021000026326', fuente: 'off', nombre: 'Nueva', modificado: 200 }),
    ]);
    expect(r[0]).toMatchObject({ nombre: 'Nueva', modificado: 200, fuentes: ['off'] });
  });

  it('toma las categorías de la primera fuente que las tenga y ordena por código', () => {
    const r = deduplicar([
      c({ barcode: '7802930000548', fuente: 'off' }),
      c({ barcode: '7802930000548', fuente: 'obf', categoriasTags: ['en:soaps'] }),
      c({ barcode: '0021000026326', fuente: 'off', categoriasTags: ['en:sauces'] }),
    ]);
    expect(r.map((x) => [x.barcode, x.categoriasTags])).toEqual([
      ['0021000026326', ['en:sauces']],
      ['7802930000548', ['en:soaps']],
    ]);
  });

  it('conserva la categoría fija de la lista curada', () => {
    const r = deduplicar([
      c({ barcode: '7802930000548', fuente: 'off', categoriasTags: ['en:snacks'] }),
      c({ barcode: '7802930000548', fuente: 'curado', origen: 'CURADO', categoriaSlug: 'quesos' }),
    ]);
    expect(r[0]?.categoriaSlug).toBe('quesos');
    expect(deduplicar([c({ barcode: '7802930000548', fuente: 'off' })])[0]).not.toHaveProperty(
      'categoriaSlug',
    );
  });
});
