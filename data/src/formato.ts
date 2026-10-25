/**
 * Formato / contenido neto de un producto ("500 g", "1,5 L", "6 x 350 ml").
 * `cantidad` es un entero en la unidad base: gramos (G), mililitros (ML) o unidades (UN).
 */
export type UnidadNeta = 'G' | 'ML' | 'UN';

export interface Formato {
  texto: string;
  unidad: UnidadNeta;
  cantidad: number;
}

const UNIDADES: Record<string, { unidad: UnidadNeta; factor: number }> = {
  g: { unidad: 'G', factor: 1 },
  gr: { unidad: 'G', factor: 1 },
  grs: { unidad: 'G', factor: 1 },
  gramo: { unidad: 'G', factor: 1 },
  gramos: { unidad: 'G', factor: 1 },
  kg: { unidad: 'G', factor: 1000 },
  kgs: { unidad: 'G', factor: 1000 },
  k: { unidad: 'G', factor: 1000 },
  kilo: { unidad: 'G', factor: 1000 },
  kilos: { unidad: 'G', factor: 1000 },
  ml: { unidad: 'ML', factor: 1 },
  cc: { unidad: 'ML', factor: 1 },
  'c.c': { unidad: 'ML', factor: 1 },
  cm3: { unidad: 'ML', factor: 1 },
  'cm³': { unidad: 'ML', factor: 1 },
  cl: { unidad: 'ML', factor: 10 },
  l: { unidad: 'ML', factor: 1000 },
  lt: { unidad: 'ML', factor: 1000 },
  lts: { unidad: 'ML', factor: 1000 },
  litro: { unidad: 'ML', factor: 1000 },
  litros: { unidad: 'ML', factor: 1000 },
};

const PALABRAS_UNIDAD =
  'unidades|unidad|uds|un|u|pcs|piezas|huevos|capsulas|cápsulas|barras|bolsitas|sobres';

// Las alternativas más largas primero para que "grs" no se lea como "g".
const UNIDAD_MEDIDA = Object.keys(UNIDADES)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace('.', '\\.'))
  .join('|');

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RE_MEDIDA = new RegExp(
  String.raw`(?:(\d+)\s*[x×]\s*)?(${NUM})\s*(${UNIDAD_MEDIDA})\.?(?![\p{L}\d])`,
  'iu',
);
const RE_UNIDADES = new RegExp(String.raw`(\d+)\s*(${PALABRAS_UNIDAD})\.?(?![\p{L}\d])`, 'iu');

/** "1.000" con unidad chica (g, ml) es mil (separador de miles chileno); "1.5" es decimal. */
function leerNumero(texto: string, factor: number): number {
  if (factor === 1 && /^\d{1,3}(\.\d{3})+$/.test(texto)) return Number(texto.replaceAll('.', ''));
  return Number(texto.replace(',', '.'));
}

/** Entero en milésimas → "1,5" (coma decimal, sin ceros sobrantes). */
function milesimasATexto(milesimas: number): string {
  const entero = Math.floor(milesimas / 1000);
  const resto = milesimas % 1000;
  if (resto === 0) return String(entero);
  return `${entero},${String(resto).padStart(3, '0').replace(/0+$/, '')}`;
}

export function textoFormato(unidad: UnidadNeta, cantidad: number): string {
  if (unidad === 'UN') return `${cantidad} un`;
  if (cantidad >= 1000) return `${milesimasATexto(cantidad)} ${unidad === 'G' ? 'kg' : 'L'}`;
  return `${cantidad} ${unidad === 'G' ? 'g' : 'ml'}`;
}

/**
 * Lee el formato de un texto libre de OFF ("cont. neto 500g", "1 litro", "6 x 330 ml",
 * "16 oz (453 g)"). Solo entiende unidades métricas y unidades sueltas; si no entiende,
 * devuelve `null` (mejor sin formato que con uno inventado).
 */
export function parsearFormato(entrada: string): Formato | null {
  const texto = entrada.toLowerCase();
  const m = RE_MEDIDA.exec(texto);
  if (m) {
    const [, pack, numero = '', sufijo = ''] = m;
    const u = UNIDADES[sufijo];
    if (!u) return null;
    const cada = Math.round(leerNumero(numero, u.factor) * u.factor);
    if (!Number.isFinite(cada) || cada <= 0) return null;
    const n = pack ? Number(pack) : 1;
    if (n > 1) {
      return {
        texto: `${n} x ${textoFormato(u.unidad, cada)}`,
        unidad: u.unidad,
        cantidad: n * cada,
      };
    }
    return { texto: textoFormato(u.unidad, cada), unidad: u.unidad, cantidad: cada };
  }
  const un = RE_UNIDADES.exec(texto);
  if (un) {
    const n = Number(un[1]);
    if (n > 0) return { texto: textoFormato('UN', n), unidad: 'UN', cantidad: n };
  }
  return null;
}

const RE_FORMATO_AL_FINAL = new RegExp(
  String.raw`[\s,(-]*((?:\d+\s*[x×]\s*)?${NUM}\s*(?:${UNIDAD_MEDIDA})\.?)\)?\s*$`,
  'iu',
);

/** Separa un formato escrito al final del nombre: "Leche Entera 1L" → "Leche Entera" + 1 L. */
export function separarFormatoDelNombre(nombre: string): {
  nombre: string;
  formato: Formato | null;
} {
  const m = RE_FORMATO_AL_FINAL.exec(nombre);
  if (!m || m.index === 0) return { nombre, formato: null };
  const formato = parsearFormato(m[1] ?? '');
  if (!formato) return { nombre, formato: null };
  return { nombre: nombre.slice(0, m.index).trim(), formato };
}
