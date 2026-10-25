import { largo } from './codificacion.js';

export type Alineacion = 'IZQUIERDA' | 'CENTRO' | 'DERECHA';

export interface EstiloLinea {
  alinear?: Alineacion;
  negrita?: boolean;
  /** Doble ancho y doble alto: usa la mitad de las columnas. */
  grande?: boolean;
}

export type Linea =
  | ({ tipo: 'TEXTO'; texto: string } & EstiloLinea)
  | { tipo: 'SEPARADOR'; caracter: string }
  | { tipo: 'AVANCE'; lineas: number };

/** Columnas de texto (fuente A): 58 mm → 32; 80 mm → 48 (algunos modelos de 80 mm usan 42). */
export const COLUMNAS_POR_ANCHO = { 58: 32, 80: 48 } as const;
export type AnchoPapel = keyof typeof COLUMNAS_POR_ANCHO;

/** Parte un texto en líneas de hasta `ancho` columnas, cortando en espacios cuando se puede. */
export function envolver(texto: string, ancho: number): string[] {
  if (ancho < 1) throw new RangeError('El ancho debe ser al menos 1');
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    let resto = palabra;
    while (largo(resto) > ancho) {
      // Palabra más larga que la línea: se corta.
      if (actual) {
        lineas.push(actual);
        actual = '';
      }
      const chars = Array.from(resto);
      lineas.push(chars.slice(0, ancho).join(''));
      resto = chars.slice(ancho).join('');
    }
    if (!actual) actual = resto;
    else if (largo(actual) + 1 + largo(resto) <= ancho) actual = `${actual} ${resto}`;
    else {
      lineas.push(actual);
      actual = resto;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

/** "Izquierda ......... derecha" en `ancho` columnas. Si no caben, la derecha baja a otra línea. */
export function dosColumnas(izquierda: string, derecha: string, ancho: number): string[] {
  const li = largo(izquierda);
  const ld = largo(derecha);
  if (li + 1 + ld <= ancho) return [izquierda + ' '.repeat(ancho - li - ld) + derecha];
  const lineas = envolver(izquierda, ancho);
  const ultima = lineas[lineas.length - 1] ?? '';
  if (largo(ultima) + 1 + ld <= ancho) {
    lineas[lineas.length - 1] = ultima + ' '.repeat(ancho - largo(ultima) - ld) + derecha;
  } else {
    lineas.push(' '.repeat(Math.max(0, ancho - ld)) + derecha);
  }
  return lineas;
}

/** Ticket armado como líneas abstractas; se convierte a ESC/POS o a texto. */
export class Documento {
  readonly lineas: Linea[] = [];
  /** Abrir el cajón de dinero al terminar (pulso ESC p). */
  abrirCajon = false;

  constructor(readonly columnas: number) {
    if (!Number.isInteger(columnas) || columnas < 16 || columnas > 64) {
      throw new RangeError('Las columnas deben estar entre 16 y 64');
    }
  }

  /** Columnas útiles con o sin letra grande. */
  ancho(grande = false): number {
    return grande ? Math.floor(this.columnas / 2) : this.columnas;
  }

  texto(texto: string, estilo: EstiloLinea = {}): this {
    for (const l of envolver(texto, this.ancho(estilo.grande))) {
      this.lineas.push({ tipo: 'TEXTO', texto: l, ...estilo });
    }
    return this;
  }

  columnas2(izquierda: string, derecha: string, estilo: Omit<EstiloLinea, 'alinear'> = {}): this {
    for (const l of dosColumnas(izquierda, derecha, this.ancho(estilo.grande))) {
      this.lineas.push({ tipo: 'TEXTO', texto: l, ...estilo });
    }
    return this;
  }

  separador(caracter = '-'): this {
    this.lineas.push({ tipo: 'SEPARADOR', caracter });
    return this;
  }

  avance(lineas = 1): this {
    this.lineas.push({ tipo: 'AVANCE', lineas });
    return this;
  }
}
