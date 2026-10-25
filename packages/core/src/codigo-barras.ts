export type TipoCodigoBarras = 'EAN13' | 'EAN8' | 'UPCA';

/** Dígito verificador GTIN (EAN/UPC) para los dígitos SIN el verificador. */
export function calcularDigitoGtin(digitos: string): number {
  if (!/^\d+$/.test(digitos)) throw new RangeError(`Solo dígitos: "${digitos}"`);
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    // Desde la derecha: peso 3, 1, 3, 1...
    const d = Number(digitos[digitos.length - 1 - i]);
    suma += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10;
}

const TIPO_POR_LARGO: Partial<Record<number, TipoCodigoBarras>> = {
  8: 'EAN8',
  12: 'UPCA',
  13: 'EAN13',
};

export type ResultadoCodigo =
  | { valido: true; tipo: TipoCodigoBarras; codigo: string }
  | { valido: false; motivo: 'FORMATO' | 'DIGITO_VERIFICADOR' };

/** Valida un EAN-13, EAN-8 o UPC-A (con su dígito verificador). Ignora espacios alrededor. */
export function validarCodigoBarras(texto: string): ResultadoCodigo {
  const codigo = texto.trim();
  const tipo = /^\d+$/.test(codigo) ? TIPO_POR_LARGO[codigo.length] : undefined;
  if (!tipo) return { valido: false, motivo: 'FORMATO' };
  const esperado = calcularDigitoGtin(codigo.slice(0, -1));
  if (esperado !== Number(codigo.slice(-1))) return { valido: false, motivo: 'DIGITO_VERIFICADOR' };
  return { valido: true, tipo, codigo };
}

/**
 * Forma canónica para buscar en la base: UPC-A se convierte a EAN-13 anteponiendo "0"
 * (es el mismo GTIN). Devuelve `null` si el código no es válido.
 */
export function normalizarCodigoBarras(texto: string): string | null {
  const r = validarCodigoBarras(texto);
  if (!r.valido) return null;
  return r.tipo === 'UPCA' ? `0${r.codigo}` : r.codigo;
}

/** EAN-13 de circulación restringida (prefijos 20–29): lo usan las balanzas del local. */
export function esCodigoDeBalanza(codigo: string): boolean {
  return /^2\d{12}$/.test(codigo.trim());
}
