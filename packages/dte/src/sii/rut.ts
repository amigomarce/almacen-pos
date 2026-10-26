import { ErrorDominio, parsearRut } from '@almacen/core';

/**
 * Normaliza un RUT al formato que exige el DTE: sin puntos, con guion y dígito
 * verificador ("76086428-5"). El schema de boleta limita el campo a 10 caracteres.
 */
export function normalizarRutDte(rut: string): string {
  const p = parsearRut(rut);
  if (!p) throw new ErrorDominio('RUT_INVALIDO', `RUT inválido: ${rut}`);
  return `${p.cuerpo}-${p.dv}`;
}
