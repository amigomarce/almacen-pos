import { describe, expect, it } from 'vitest';
import { elem, elemAtributos, escaparAtributo, escaparTexto } from './xml.js';

describe('escapado XML', () => {
  it('escapa & < > en texto', () => {
    expect(escaparTexto('A&B <C>')).toBe('A&amp;B &lt;C&gt;');
  });

  it('escapa comillas en atributos', () => {
    expect(escaparAtributo('a"b')).toBe('a&quot;b');
  });

  it('construye elementos compactos', () => {
    expect(elem('RE', '76086428-5')).toBe('<RE>76086428-5</RE>');
    expect(elemAtributos('TED', [['version', '1.0']], '<DD/>')).toBe(
      '<TED version="1.0"><DD/></TED>',
    );
  });
});
