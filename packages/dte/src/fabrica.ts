import { ErrorDominio } from '@almacen/core';
import { MockProvider } from './mock-provider.js';
import { PuenteManualProvider } from './puente-manual-provider.js';
import type { ModeloEmision, NombreProvider } from './tipos.js';

/** Modalidades de boleta que ya se pueden usar. `SII_DIRECTO` llega en la Fase 5. */
export const MODALIDADES_DISPONIBLES: readonly NombreProvider[] = ['PUENTE_MANUAL', 'MOCK'];

/** Valor inicial en una instalación real (ADR-001, Estrategia D). `MOCK` es solo para desarrollo. */
export const MODALIDAD_INICIAL: NombreProvider = 'PUENTE_MANUAL';

export function modalidadDisponible(nombre: NombreProvider): boolean {
  return MODALIDADES_DISPONIBLES.includes(nombre);
}

/** El provider según la configuración del local (`store_settings`). */
export function crearProvider(
  nombre: NombreProvider,
  modelo: ModeloEmision,
): MockProvider | PuenteManualProvider {
  switch (nombre) {
    case 'MOCK':
      return new MockProvider(modelo);
    case 'PUENTE_MANUAL':
      return new PuenteManualProvider(modelo);
    case 'SII_DIRECTO':
    case 'PROVEEDOR_EXTERNO':
      throw new ErrorDominio(
        'MODALIDAD_NO_DISPONIBLE',
        `La modalidad ${nombre} todavía no está disponible`,
      );
  }
}
