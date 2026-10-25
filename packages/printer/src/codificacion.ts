/**
 * Las impresoras térmicas no entienden UTF-8: hay que elegir una "página de códigos" (ESC t n)
 * y mandar cada carácter como un byte. La que funciona depende del modelo; se elige en la
 * configuración y se verifica con el ticket de prueba (acentos y ñ).
 */
export type PaginaCodigos = 'CP858' | 'CP850' | 'WPC1252';

/** Número para `ESC t n` en impresoras Epson y compatibles (Xprinter, 3nStar, Bixolon). */
export const NUMERO_ESC_T: Record<PaginaCodigos, number> = {
  CP850: 2,
  WPC1252: 16,
  CP858: 19,
};

/** CP850 (y CP858, que solo cambia 0xD5 por €): caracteres útiles en Chile. */
const CP850: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  É: 0x90,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  Ö: 0x99,
  Ü: 0x9a,
  '×': 0x9e,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  ª: 0xa6,
  º: 0xa7,
  '¿': 0xa8,
  '¡': 0xad,
  Á: 0xb5,
  Â: 0xb6,
  À: 0xb7,
  Ê: 0xd2,
  Ë: 0xd3,
  È: 0xd4,
  Í: 0xd6,
  Î: 0xd7,
  Ï: 0xd8,
  Ì: 0xde,
  Ó: 0xe0,
  Ô: 0xe2,
  Ò: 0xe3,
  Ú: 0xe9,
  Û: 0xea,
  Ù: 0xeb,
  '°': 0xf8,
  '·': 0xfa,
};

const TABLAS: Record<PaginaCodigos, Record<string, number>> = {
  CP850,
  CP858: { ...CP850, '€': 0xd5 },
  WPC1252: {
    '€': 0x80,
    '…': 0x85,
    '‘': 0x91,
    '’': 0x92,
    '“': 0x93,
    '”': 0x94,
    '–': 0x96,
    '—': 0x97,
  },
};

/** Reemplazos 1 a 1 (el largo no cambia, así las columnas cuadran) para lo que no esté en la tabla. */
const EQUIVALENTES: Record<string, string> = {
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '.',
  '€': 'E',
  '·': '-',
  '×': 'x',
  '°': 'o',
  º: 'o',
  ª: 'a',
  ' ': ' ',
};

function enTabla(ch: string, pagina: PaginaCodigos): number | undefined {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x20 && cp < 0x7f) return cp;
  // WPC1252 coincide con Latin-1 entre U+00A0 y U+00FF.
  if (pagina === 'WPC1252' && cp >= 0xa0 && cp <= 0xff) return cp;
  return TABLAS[pagina][ch];
}

/** Un carácter imprimible en la página elegida (siempre 1 carácter, para no descuadrar columnas). */
function normalizarCaracter(ch: string, pagina: PaginaCodigos): string {
  if (enTabla(ch, pagina) !== undefined) return ch;
  const equivalente = EQUIVALENTES[ch];
  if (equivalente !== undefined && enTabla(equivalente, pagina) !== undefined) return equivalente;
  const sinTilde = ch.normalize('NFD').replace(/\p{M}/gu, '');
  if (sinTilde.length === 1 && enTabla(sinTilde, pagina) !== undefined) return sinTilde;
  return '?';
}

/** Texto tal como saldrá impreso (sirve también para la vista previa). */
export function normalizarTexto(texto: string, pagina: PaginaCodigos): string {
  return Array.from(texto.normalize('NFC').replace(/[\r\n\t]+/g, ' '))
    .map((ch) => normalizarCaracter(ch, pagina))
    .join('');
}

export function codificar(texto: string, pagina: PaginaCodigos): Uint8Array {
  return Uint8Array.from(
    Array.from(normalizarTexto(texto, pagina)).map((ch) => enTabla(ch, pagina) ?? 0x3f),
  );
}

/** Largo visible (en columnas) de un texto: cuenta caracteres, no bytes UTF-16. */
export function largo(texto: string): number {
  return Array.from(texto.normalize('NFC')).length;
}
