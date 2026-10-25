import { describe, expect, it } from 'vitest';
import { leerEntrada } from './entrada.js';

describe('leerEntrada', () => {
  it.each([
    ['', { tipo: 'VACIA' }],
    ['   ', { tipo: 'VACIA' }],
    ['7800000000011', { tipo: 'CODIGO', codigo: '7800000000011', multiplicador: null }],
    [' 3*7800000000011 ', { tipo: 'CODIGO', codigo: '7800000000011', multiplicador: 3 }],
    ['12x78000000', { tipo: 'CODIGO', codigo: '78000000', multiplicador: 12 }],
    ['2 X 123', { tipo: 'CODIGO', codigo: '123', multiplicador: 2 }],
    ['leche', { tipo: 'TEXTO', texto: 'leche' }],
    ['3*leche', { tipo: 'TEXTO', texto: '3*leche' }],
    ['0*780', { tipo: 'INVALIDA', mensaje: 'La cantidad debe estar entre 1 y 999' }],
    ['1000*780', { tipo: 'INVALIDA', mensaje: 'La cantidad debe estar entre 1 y 999' }],
  ])('"%s"', (texto, esperado) => {
    expect(leerEntrada(texto)).toEqual(esperado);
  });
});
