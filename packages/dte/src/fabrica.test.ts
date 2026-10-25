import { ErrorDominio } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import {
  crearProvider,
  MockProvider,
  MODALIDAD_INICIAL,
  modalidadDisponible,
  PuenteManualProvider,
} from './index.js';

describe('crearProvider', () => {
  it('la modalidad inicial de una instalación real es el puente manual', () => {
    expect(MODALIDAD_INICIAL).toBe('PUENTE_MANUAL');
  });

  it('crea el provider de cada modalidad disponible', () => {
    expect(crearProvider('MOCK', 'SOLO_NO_ELECTRONICOS')).toBeInstanceOf(MockProvider);
    expect(crearProvider('PUENTE_MANUAL', 'TODO_MEDIO_PAGO')).toBeInstanceOf(PuenteManualProvider);
    expect(modalidadDisponible('MOCK')).toBe(true);
    expect(modalidadDisponible('PUENTE_MANUAL')).toBe(true);
  });

  it.each(['SII_DIRECTO', 'PROVEEDOR_EXTERNO'] as const)('%s todavía no está disponible', (n) => {
    expect(modalidadDisponible(n)).toBe(false);
    expect(() => crearProvider(n, 'SOLO_NO_ELECTRONICOS')).toThrow(ErrorDominio);
  });
});
