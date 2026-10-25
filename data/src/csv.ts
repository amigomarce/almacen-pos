/**
 * CSV mínimo (RFC 4180): separador coma, comillas dobles para campos con comas o comillas,
 * primera fila = encabezado. Líneas vacías y las que empiezan con `#` se ignoran
 * (sirven de comentario en los CSV editables a mano).
 */
export function parsearCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === '' || linea.startsWith('#')) continue;
    filas.push(partirLinea(linea));
  }
  const [encabezado, ...resto] = filas;
  if (!encabezado) return [];
  return resto.map((campos) =>
    Object.fromEntries(encabezado.map((col, i) => [col.trim(), (campos[i] ?? '').trim()])),
  );
}

function partirLinea(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea.charAt(i);
    if (enComillas) {
      if (ch === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (ch === '"') enComillas = false;
      else actual += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === ',') {
      campos.push(actual);
      actual = '';
    } else actual += ch;
  }
  campos.push(actual);
  return campos;
}
