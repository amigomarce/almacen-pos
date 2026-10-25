import {
  codificar,
  largo,
  normalizarTexto,
  NUMERO_ESC_T,
  type PaginaCodigos,
} from './codificacion.js';
import type { Alineacion, Documento } from './documento.js';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Comandos ESC/POS (Epson y compatibles). */
export const CMD = {
  inicializar: [ESC, 0x40],
  paginaCodigos: (n: number) => [ESC, 0x74, n],
  alinear: (a: Alineacion) => [ESC, 0x61, a === 'IZQUIERDA' ? 0 : a === 'CENTRO' ? 1 : 2],
  negrita: (on: boolean) => [ESC, 0x45, on ? 1 : 0],
  /** GS ! n: 0x11 = doble ancho y doble alto. */
  tamano: (grande: boolean) => [GS, 0x21, grande ? 0x11 : 0x00],
  avanzar: (lineas: number) => [ESC, 0x64, Math.max(0, Math.min(255, lineas))],
  /** GS V 66 n: avanza hasta la cuchilla y hace corte parcial. */
  cortar: [GS, 0x56, 0x42, 0x00],
  /** ESC p m t1 t2: pulso al pin 2 del conector del cajón (25 × 2 ms encendido, 250 × 2 ms apagado). */
  abrirCajon: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

export interface OpcionesImpresion {
  paginaCodigos: PaginaCodigos;
  /** Cortar el papel al final (si la impresora tiene cuchilla). */
  cortar?: boolean;
  /** Líneas en blanco antes del corte, para que el texto pase la cuchilla. */
  avanceFinal?: number;
}

/** Convierte el documento en los bytes que se mandan a la impresora. */
export function aEscPos(doc: Documento, opciones: OpcionesImpresion): Uint8Array {
  const { paginaCodigos, cortar = true, avanceFinal = 3 } = opciones;
  const bytes: number[] = [...CMD.inicializar, ...CMD.paginaCodigos(NUMERO_ESC_T[paginaCodigos])];
  for (const l of doc.lineas) {
    if (l.tipo === 'AVANCE') {
      bytes.push(...CMD.avanzar(l.lineas));
      continue;
    }
    if (l.tipo === 'SEPARADOR') {
      bytes.push(
        ...CMD.alinear('IZQUIERDA'),
        ...codificar(l.caracter.repeat(doc.columnas), paginaCodigos),
        LF,
      );
      continue;
    }
    const grande = l.grande ?? false;
    const negrita = l.negrita ?? false;
    bytes.push(...CMD.alinear(l.alinear ?? 'IZQUIERDA'));
    if (negrita) bytes.push(...CMD.negrita(true));
    if (grande) bytes.push(...CMD.tamano(true));
    bytes.push(...codificar(l.texto, paginaCodigos), LF);
    if (grande) bytes.push(...CMD.tamano(false));
    if (negrita) bytes.push(...CMD.negrita(false));
  }
  bytes.push(...CMD.alinear('IZQUIERDA'));
  if (cortar) bytes.push(...CMD.avanzar(avanceFinal), ...CMD.cortar);
  if (doc.abrirCajon) bytes.push(...CMD.abrirCajon);
  return Uint8Array.from(bytes);
}

/**
 * Vista previa en texto (para tests, la pantalla y probar sin impresora). La letra grande se
 * muestra con espacios entre letras para ocupar el mismo ancho que en el papel.
 */
export function aTexto(doc: Documento, paginaCodigos: PaginaCodigos = 'CP858'): string {
  const salida: string[] = [];
  for (const l of doc.lineas) {
    if (l.tipo === 'AVANCE') {
      for (let i = 0; i < l.lineas; i++) salida.push('');
      continue;
    }
    if (l.tipo === 'SEPARADOR') {
      salida.push(normalizarTexto(l.caracter.repeat(doc.columnas), paginaCodigos));
      continue;
    }
    const texto = normalizarTexto(l.texto, paginaCodigos);
    const visible = l.grande ? Array.from(texto).join(' ') : texto;
    const libre = Math.max(0, doc.columnas - largo(visible));
    const izquierda =
      l.alinear === 'CENTRO' ? Math.floor(libre / 2) : l.alinear === 'DERECHA' ? libre : 0;
    salida.push((' '.repeat(izquierda) + visible).trimEnd());
  }
  return salida.join('\n');
}
