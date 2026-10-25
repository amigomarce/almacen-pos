import { describe, expect, it } from 'vitest';
import { MapeoCategorias, cargarTaxonomia, claveEtiqueta } from './categorias.js';

const TAXONOMIA = `slug,nombre,padre
bebidas,Bebidas,
gaseosas,Bebidas gaseosas,bebidas
alcoholes,Alcoholes,
vino,Vinos,alcoholes
lacteos-huevos,Lácteos y huevos,
quesos,Quesos,lacteos-huevos
otros,Otros,
aseo-personal,Aseo personal,
mascotas,Mascotas,
`;

const MAPEO = `# comentario
off_tag,categoria_slug,prioridad
en:beverages,bebidas,1
en:alcoholic-beverages,alcoholes,2
en:wines,vino,3
en:Bebidas gaseosas,gaseosas,3
en:quesos,quesos
en:dairies,lacteos-huevos,1
`;

const tax = cargarTaxonomia(TAXONOMIA);
const PALABRAS = `palabra,categoria_slug
queso,quesos
quesillo,quesos
vino,vino
`;
const mapeo = new MapeoCategorias(MAPEO, tax, PALABRAS);
const slug = (tags: string[], fuente: 'off' | 'obf' | 'opff' = 'off', nombre = '') =>
  mapeo.categorizar(tags, fuente, nombre).slug;

describe('claveEtiqueta', () => {
  it('ignora idioma, mayúsculas, tildes y separadores', () => {
    expect(claveEtiqueta('en:Bebidas gaseosas')).toBe('bebidas-gaseosas');
    expect(claveEtiqueta('es:bebidas-gaseosas')).toBe('bebidas-gaseosas');
    expect(claveEtiqueta('en:Lácteos')).toBe('lacteos');
  });
});

describe('MapeoCategorias', () => {
  it('gana la etiqueta más específica (mayor prioridad)', () => {
    expect(slug(['en:beverages', 'en:alcoholic-beverages', 'en:wines'], 'off')).toBe('vino');
    expect(slug(['en:wines', 'en:beverages'], 'off')).toBe('vino');
  });

  it('acepta etiquetas en español escritas de cualquier forma', () => {
    expect(slug(['en:bebidas-gaseosas'], 'off')).toBe('gaseosas');
    expect(slug(['en:Quesos'], 'off')).toBe('quesos');
  });

  it('en empate de prioridad gana la etiqueta que viene después', () => {
    expect(slug(['en:quesos', 'en:alcoholic-beverages'], 'off')).toBe('alcoholes');
  });

  it('sin etiquetas útiles busca la primera palabra conocida del nombre', () => {
    expect(mapeo.categorizar([], 'off', 'Quesillo fresco')).toEqual({
      slug: 'quesos',
      via: 'PALABRA',
    });
    expect(slug(['en:desconocida'], 'off', 'Salsa de vino tinto')).toBe('vino');
    expect(mapeo.categorizar(['en:wines'], 'off', 'Queso')).toEqual({
      slug: 'vino',
      via: 'ETIQUETA',
    });
    // En cosmética/mascotas manda la fuente: "Jabón de queso" no es un queso.
    expect(slug([], 'obf', 'Jabón de queso')).toBe('aseo-personal');
  });

  it('dice cómo decidió', () => {
    expect(mapeo.categorizar([], 'obf').via).toBe('FUENTE');
    expect(mapeo.categorizar([], 'off', 'Cosa rara').via).toBe('NINGUNA');
    expect(
      () => new MapeoCategorias('', tax, 'palabra,categoria_slug\npan amasado,quesos'),
    ).toThrow('palabra inválida');
    expect(() => new MapeoCategorias('', tax, 'palabra,categoria_slug\npan,nada')).toThrow(
      'categoría desconocida',
    );
  });

  it('sin coincidencias usa la categoría de la fuente u "otros"', () => {
    expect(slug(['en:desconocida'], 'off')).toBe('otros');
    expect(slug([], 'obf')).toBe('aseo-personal');
    expect(slug([], 'opff')).toBe('mascotas');
  });

  it('rechaza categorías inexistentes y etiquetas duplicadas con otro destino', () => {
    expect(() => new MapeoCategorias('off_tag,categoria_slug\nen:x,no-existe', tax)).toThrow(
      'mapeo_categorias.csv ("en:x"): categoría desconocida "no-existe"',
    );
    expect(
      () => new MapeoCategorias('off_tag,categoria_slug\nen:x,vino\nes:X,quesos', tax),
    ).toThrow('ya está mapeada');
    expect(() => new MapeoCategorias('off_tag,categoria_slug,prioridad\nen:x,vino,0', tax)).toThrow(
      'prioridad inválida',
    );
  });
});

describe('cargarTaxonomia', () => {
  it('valida padres, slugs y que exista "otros"', () => {
    expect(tax.get('vino')).toEqual({ slug: 'vino', nombre: 'Vinos', padre: 'alcoholes' });
    expect(() => cargarTaxonomia('slug,nombre,padre\notros,Otros,\nx,X,nada')).toThrow('padre');
    expect(() => cargarTaxonomia('slug,nombre,padre\nOtros Malo,X,')).toThrow('slug inválido');
    expect(() => cargarTaxonomia('slug,nombre,padre\na,A,\na,A,')).toThrow('repetido');
    expect(() => cargarTaxonomia('slug,nombre,padre\na,A,')).toThrow('falta "otros"');
  });
});
