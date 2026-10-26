/**
 * Construcción de XML compacto (sin espacios entre elementos), listo para firmar.
 *
 * El DTE se genera sin espacios en blanco entre etiquetas porque la firma del timbre
 * (FRMT) se calcula sobre el elemento `<DD>` "aplanado", y la firma XMLDSig sobre la
 * forma canónica (C14N) del `<Documento>`. Al generar compacto, ambas formas coinciden
 * con la cadena literal.
 */

/** Escapa contenido de elemento (C14N/XML: `&`, `<`, `>` y retorno de carro). */
export function escaparTexto(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xD;');
}

/** Escapa el valor de un atributo (además, las comillas dobles). */
export function escaparAtributo(s: string): string {
  return escaparTexto(s).replaceAll('"', '&quot;');
}

/** `<nombre>contenido</nombre>` compacto. */
export function elem(nombre: string, contenido: string): string {
  return `<${nombre}>${contenido}</${nombre}>`;
}

/**
 * `<nombre a="v">contenido</nombre>` compacto. Los atributos van en el orden dado;
 * para que la forma sea canónica se deben pasar en orden lexicográfico.
 */
export function elemAtributos(
  nombre: string,
  atributos: readonly (readonly [string, string])[],
  contenido: string,
): string {
  const attrs = atributos.map(([k, v]) => `${k}="${escaparAtributo(v)}"`).join(' ');
  return `<${nombre}${attrs === '' ? '' : ` ${attrs}`}>${contenido}</${nombre}>`;
}
