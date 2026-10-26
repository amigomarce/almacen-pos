import { describe, expect, it } from 'vitest';
import { EstadoFolios, validarFolio } from './folios.js';
import { parsearCaf } from './caf.js';
import { generarCafPrueba } from './test/ayudas.js';

describe('control de folios', () => {
  it('asigna correlativamente desde el inicio del rango', () => {
    const caf = parsearCaf(generarCafPrueba({ desde: 5, hasta: 7 }).xml);
    const estado = new EstadoFolios(caf);
    expect(estado.asignar()).toBe(5);
    expect(estado.asignar()).toBe(6);
    expect(estado.disponibles).toBe(1);
    expect(estado.asignar()).toBe(7);
    expect(estado.disponibles).toBe(0);
  });

  it('lanza al agotarse el CAF', () => {
    const caf = parsearCaf(generarCafPrueba({ desde: 1, hasta: 1 }).xml);
    const estado = new EstadoFolios(caf);
    expect(estado.asignar()).toBe(1);
    expect(() => estado.asignar()).toThrow(expect.objectContaining({ codigo: 'CAF_AGOTADO' }));
  });

  it('valida que un folio esté dentro del rango', () => {
    const caf = parsearCaf(generarCafPrueba({ desde: 10, hasta: 20 }).xml);
    expect(() => {
      validarFolio(caf, 10);
    }).not.toThrow();
    expect(() => {
      validarFolio(caf, 20);
    }).not.toThrow();
    expect(() => {
      validarFolio(caf, 9);
    }).toThrow(expect.objectContaining({ codigo: 'FOLIO_FUERA_DE_RANGO' }));
    expect(() => {
      validarFolio(caf, 21);
    }).toThrow(expect.objectContaining({ codigo: 'FOLIO_FUERA_DE_RANGO' }));
  });
});
