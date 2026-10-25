/** Clave para comparar textos: minúsculas, sin tildes y solo letras/dígitos ("Watt's" → "watts"). */
export function claveTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CONECTORES = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'los',
  'o',
  'para',
  'por',
  'sin',
  'u',
  'y',
]);

const tieneMinusculas = (s: string) => /\p{Ll}/u.test(s);

/** "LECHE ENTERA DE VACA" → "Leche Entera de Vaca". */
export function tipoTitulo(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/**
 * Arregla mayúsculas típicas de OFF sin tocar lo que ya viene bien escrito:
 * todo en MAYÚSCULAS → tipo título; en cualquier otro caso, solo la primera letra mayúscula.
 */
export function arreglarMayusculas(s: string): string {
  const letras = s.replace(/[^\p{L}]/gu, '');
  if (letras.length >= 4 && !tieneMinusculas(s)) return tipoTitulo(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Espacios simples, sin puntuación suelta al final, comillas tipográficas normalizadas. */
export function limpiarTexto(s: string): string {
  return s
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:\-–]+$/u, '')
    .trim();
}
