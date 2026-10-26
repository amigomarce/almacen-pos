import { ErrorDominio } from '@almacen/core';
import type { Caf } from './tipos.js';

/** Valida que un folio esté dentro del rango autorizado por el CAF. */
export function validarFolio(caf: Caf, folio: number): void {
  if (!Number.isInteger(folio) || folio < caf.folioDesde || folio > caf.folioHasta) {
    throw new ErrorDominio(
      'FOLIO_FUERA_DE_RANGO',
      `Folio ${folio} fuera del rango ${caf.folioDesde}–${caf.folioHasta}`,
    );
  }
}

/**
 * Control de folios de un CAF. Asigna correlativamente desde `folioDesde` y avisa
 * cuando se agota el rango. La persistencia del "último folio usado" queda en el
 * proveedor (Fase 5, etapa 3); esta clase solo da el estado en memoria.
 */
export class EstadoFolios {
  private ultimo: number;

  constructor(private readonly caf: Caf) {
    this.ultimo = caf.folioDesde - 1;
  }

  get disponibles(): number {
    return Math.max(0, this.caf.folioHasta - this.ultimo);
  }

  asignar(): number {
    if (this.disponibles === 0) {
      throw new ErrorDominio(
        'CAF_AGOTADO',
        `No quedan folios (rango ${this.caf.folioDesde}–${this.caf.folioHasta})`,
      );
    }
    this.ultimo += 1;
    return this.ultimo;
  }
}
