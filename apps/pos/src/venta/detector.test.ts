import { describe, expect, it } from 'vitest';
import { DetectorEscaneo } from './detector.js';

const rafaga = (d: DetectorEscaneo, texto: string, inicio: number, paso: number) => {
  let t = inicio;
  for (const ch of texto) {
    expect(d.tecla(ch, t)).toBeNull();
    t += paso;
  }
  return d.tecla('Enter', t);
};

describe('DetectorEscaneo', () => {
  it('reconoce una ráfaga rápida terminada en Enter', () => {
    expect(rafaga(new DetectorEscaneo(), '7800000000011', 1000, 8)).toBe('7800000000011');
  });

  it('una persona tipeando lento no es un escaneo', () => {
    expect(rafaga(new DetectorEscaneo(), '7800000000011', 1000, 120)).toBeNull();
  });

  it('exige un largo mínimo', () => {
    expect(rafaga(new DetectorEscaneo(), '123', 0, 5)).toBeNull();
  });

  it('una pausa reinicia el código (lo anterior era tipeo humano)', () => {
    const d = new DetectorEscaneo();
    d.tecla('l', 0);
    d.tecla('e', 300);
    expect(rafaga(d, '78000000', 1000, 5)).toBe('78000000');
  });

  it('teclas especiales cortan la ráfaga, y un Enter lento no cuenta', () => {
    const d = new DetectorEscaneo();
    for (const [i, ch] of Array.from('780000').entries()) d.tecla(ch, i * 5);
    d.tecla('Shift', 30);
    expect(d.tecla('Enter', 35)).toBeNull();
    for (const [i, ch] of Array.from('780000').entries()) d.tecla(ch, 100 + i * 5);
    expect(d.tecla('Enter', 500)).toBeNull();
  });
});
