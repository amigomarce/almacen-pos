import { describe, expect, it } from 'vitest';
import { codificar, largo, normalizarTexto } from './codificacion.js';

const bytes = (t: string, p: Parameters<typeof codificar>[1]) => Array.from(codificar(t, p));

describe('codificación para la impresora', () => {
  it('ASCII pasa tal cual', () => {
    expect(bytes('Total $1.290', 'CP858')).toEqual(
      Array.from(Buffer.from('Total $1.290', 'ascii')),
    );
  });

  it('CP850/CP858: acentos, eñes, signos y N°', () => {
    expect(bytes('ñÑáéíóúÁÉÍÓÚü¿¡°', 'CP858')).toEqual([
      0xa4, 0xa5, 0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0xb5, 0x90, 0xd6, 0xe0, 0xe9, 0x81, 0xa8, 0xad,
      0xf8,
    ]);
    expect(bytes('€', 'CP858')).toEqual([0xd5]);
    expect(bytes('€', 'CP850')).toEqual([0x45]); // CP850 no tiene €: "E"
  });

  it('WPC1252: Latin-1 directo, más € y guiones tipográficos', () => {
    expect(bytes('ñÑé°€–', 'WPC1252')).toEqual([0xf1, 0xd1, 0xe9, 0xb0, 0x80, 0x96]);
  });

  it('reemplaza 1 a 1 lo que no existe, sin cambiar el largo', () => {
    expect(normalizarTexto('COMPROBANTE – NO VÁLIDO', 'CP858')).toBe('COMPROBANTE - NO VÁLIDO');
    expect(normalizarTexto('“Hola”… 😀', 'CP850')).toBe('"Hola". ?');
    expect(normalizarTexto('ş', 'CP850')).toBe('s');
    expect(normalizarTexto('línea\nnueva\tcon\r\ntab', 'CP858')).toBe('línea nueva con tab');
  });

  it('une tildes combinadas (NFD) antes de codificar', () => {
    expect(bytes('ñ', 'CP858')).toEqual([0xa4]);
  });

  it('el largo cuenta caracteres visibles', () => {
    expect(largo('Ñuñoa')).toBe(5);
    expect(largo('ñ')).toBe(1);
  });
});
