import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

/**
 * Lee un TSV (formato de los exports Open*Facts: separado por tabs, sin comillas, la primera
 * línea es el encabezado) y entrega cada fila como objeto con las columnas pedidas.
 * Una columna que no está en el encabezado es un error: el export cambió de formato.
 */
export async function* leerTsv<C extends string>(
  entrada: Readable,
  columnas: readonly C[],
): AsyncGenerator<Record<C, string>> {
  const lineas = createInterface({ input: entrada, crlfDelay: Infinity });
  let indices: number[] | null = null;
  for await (const linea of lineas) {
    const campos = linea.split('\t');
    if (indices === null) {
      indices = columnas.map((col) => {
        const i = campos.indexOf(col);
        if (i < 0) throw new Error(`Falta la columna "${col}" en el encabezado`);
        return i;
      });
      continue;
    }
    if (linea === '') continue;
    const fila = {} as Record<C, string>;
    columnas.forEach((col, k) => {
      fila[col] = campos[indices?.[k] ?? -1] ?? '';
    });
    yield fila;
  }
}

/** Abre un archivo .gz (o plano) como stream de texto. */
export function abrirArchivo(ruta: string): Readable {
  const stream = createReadStream(ruta);
  return ruta.endsWith('.gz') ? stream.pipe(createGunzip()) : stream;
}
