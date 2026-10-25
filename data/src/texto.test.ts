import { describe, expect, it } from 'vitest';
import { arreglarMayusculas, claveTexto, limpiarTexto, tipoTitulo } from './texto.js';

describe('texto', () => {
  it('claveTexto ignora tildes, mayúsculas y signos', () => {
    expect(claveTexto('Watt’s')).toBe('watts');
    expect(claveTexto('Colún')).toBe(claveTexto('COLUN'));
    expect(claveTexto('Cuisine & Co.')).toBe('cuisineco');
  });

  it('tipoTitulo deja los conectores en minúscula', () => {
    expect(tipoTitulo('LECHE ENTERA DE VACA')).toBe('Leche Entera de Vaca');
    expect(tipoTitulo('DE TODO')).toBe('De Todo');
  });

  it('arreglarMayusculas solo corrige MAYÚSCULAS completas', () => {
    expect(arreglarMayusculas('ATÚN STEAK')).toBe('Atún Steak');
    expect(arreglarMayusculas('granola multisemillas')).toBe('Granola multisemillas');
    expect(arreglarMayusculas('Mi Quesillo')).toBe('Mi Quesillo');
    expect(arreglarMayusculas('PF')).toBe('PF');
  });

  it('limpiarTexto normaliza espacios, comillas y puntuación final', () => {
    expect(limpiarTexto('  Nestlé.  ')).toBe('Nestlé');
    expect(limpiarTexto('Lay’s   Clásicas -')).toBe("Lay's Clásicas");
  });
});
