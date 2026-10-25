import { describe, expect, it } from 'vitest';
import { Documento } from './documento.js';
import { aEscPos, aTexto, CMD } from './escpos.js';

const contiene = (todo: Uint8Array, parte: readonly number[]): boolean =>
  Buffer.from(todo).includes(Buffer.from(parte));

describe('aEscPos', () => {
  const doc = new Documento(32)
    .texto('Hola', { negrita: true, alinear: 'CENTRO' })
    .texto('TOTAL', { grande: true })
    .separador()
    .avance(2);

  it('inicializa y elige la página de códigos', () => {
    const b = aEscPos(doc, { paginaCodigos: 'CP858' });
    expect(Array.from(b.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
    expect(Array.from(aEscPos(doc, { paginaCodigos: 'WPC1252' }).slice(2, 5))).toEqual([
      0x1b, 0x74, 16,
    ]);
  });

  it('activa y desactiva negrita, tamaño y alineación', () => {
    const b = aEscPos(doc, { paginaCodigos: 'CP858' });
    expect(
      contiene(b, [
        ...CMD.alinear('CENTRO'),
        ...CMD.negrita(true),
        0x48,
        0x6f,
        0x6c,
        0x61,
        0x0a,
        ...CMD.negrita(false),
      ]),
    ).toBe(true);
    expect(
      contiene(b, [...CMD.tamano(true), ...Buffer.from('TOTAL'), 0x0a, ...CMD.tamano(false)]),
    ).toBe(true);
    expect(contiene(b, [...Buffer.from('-'.repeat(32)), 0x0a])).toBe(true);
    expect(contiene(b, CMD.avanzar(2))).toBe(true);
  });

  it('avanza y corta al final; sin corte si se pide', () => {
    const b = aEscPos(doc, { paginaCodigos: 'CP858' });
    expect(Array.from(b.slice(-7))).toEqual([...CMD.avanzar(3), ...CMD.cortar]);
    const sinCorte = aEscPos(doc, { paginaCodigos: 'CP858', cortar: false });
    expect(contiene(sinCorte, CMD.cortar)).toBe(false);
  });

  it('abre el cajón al final si el documento lo pide', () => {
    const conCajon = new Documento(32).texto('x');
    conCajon.abrirCajon = true;
    const b = aEscPos(conCajon, { paginaCodigos: 'CP858' });
    expect(Array.from(b.slice(-5))).toEqual([...CMD.abrirCajon]);
    expect(contiene(aEscPos(doc, { paginaCodigos: 'CP858' }), CMD.abrirCajon)).toBe(false);
  });

  it('limita el avance a 0..255', () => {
    expect(CMD.avanzar(999)).toEqual([0x1b, 0x64, 255]);
    expect(CMD.avanzar(-1)).toEqual([0x1b, 0x64, 0]);
    expect(CMD.alinear('DERECHA')).toEqual([0x1b, 0x61, 2]);
  });
});

describe('aTexto', () => {
  it('alinea, separa y muestra la letra grande con su ancho real', () => {
    const doc = new Documento(16)
      .texto('Centro', { alinear: 'CENTRO' })
      .texto('Der', { alinear: 'DERECHA' })
      .texto('GRANDE', { grande: true })
      .separador('=')
      .avance();
    expect(aTexto(doc)).toBe(
      ['     Centro', '             Der', 'G R A N D E', '='.repeat(16), ''].join('\n'),
    );
  });
});
