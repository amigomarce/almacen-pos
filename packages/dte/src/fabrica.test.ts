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
    expect(modalidadDisponible('SII_DIRECTO')).toBe(true);
  });

  it('SII_DIRECTO se construye con la configuración del local, no con crearProvider', () => {
    expect(() => crearProvider('SII_DIRECTO', 'SOLO_NO_ELECTRONICOS')).toThrow(
      expect.objectContaining({ codigo: 'SII_REQUIERE_CONFIGURACION' }),
    );
  });

  it('PROVEEDOR_EXTERNO todavía no está disponible', () => {
    expect(modalidadDisponible('PROVEEDOR_EXTERNO')).toBe(false);
    expect(() => crearProvider('PROVEEDOR_EXTERNO', 'SOLO_NO_ELECTRONICOS')).toThrow(ErrorDominio);
  });
});
