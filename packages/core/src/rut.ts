export interface Rut {
  cuerpo: number;
  dv: string;
}

/** Calcula el dígito verificador (módulo 11) de un cuerpo de RUT. */
export function calcularDvRut(cuerpo: number): string {
  if (!Number.isSafeInteger(cuerpo) || cuerpo <= 0) {
    throw new RangeError(`Cuerpo de RUT inválido: ${cuerpo}`);
  }
  let suma = 0;
  let factor = 2;
  let resto = cuerpo;
  while (resto > 0) {
    suma += (resto % 10) * factor;
    resto = Math.floor(resto / 10);
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (suma % 11);
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/**
 * Lee un RUT en cualquier formato habitual ("12.345.678-5", "12345678-5", "123456785",
 * con k minúscula o espacios). Devuelve `null` si el formato o el dígito verificador fallan.
 */
export function parsearRut(texto: string): Rut | null {
  const limpio = texto.trim().toUpperCase();
  if (!/^[\d.\s-]*\d[\s-]*[\dK]$/.test(limpio)) return null;
  // Puntos solo como separadores de miles válidos.
  const sinGuion = limpio.replace(/\s/g, '');
  const conPuntos = sinGuion.includes('.');
  if (conPuntos && !/^\d{1,3}(\.\d{3})+-?[\dK]$/.test(sinGuion)) return null;

  const compacto = sinGuion.replace(/[.-]/g, '');
  const cuerpoTexto = compacto.slice(0, -1);
  const dv = compacto.slice(-1);
  if (cuerpoTexto.length === 0 || cuerpoTexto.length > 9) return null;
  const cuerpo = Number(cuerpoTexto);
  if (cuerpo <= 0) return null;
  return calcularDvRut(cuerpo) === dv ? { cuerpo, dv } : null;
}

export function validarRut(texto: string): boolean {
  return parsearRut(texto) !== null;
}

/** "123456785" → "12.345.678-5". Devuelve `null` si el RUT no es válido. */
export function formatearRut(texto: string): string | null {
  const rut = parsearRut(texto);
  if (!rut) return null;
  const miles = rut.cuerpo.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${miles}-${rut.dv}`;
}
