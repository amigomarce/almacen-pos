import { arreglarMayusculas, claveTexto, limpiarTexto, tipoTitulo } from './texto.js';

const todoMayusculas = (s: string) => !/\p{Ll}/u.test(s);
const todoMinusculas = (s: string) => !/\p{Lu}/u.test(s);

/** Una marca "mal escrita" en mayúsculas o minúsculas completas (las siglas cortas como PF se respetan). */
function malCapitalizada(s: string): boolean {
  const letras = s.replace(/[^\p{L}]/gu, '').length;
  return todoMinusculas(s) || (todoMayusculas(s) && letras > 3);
}

/**
 * Unifica las variantes de una marca ("Colun", "COLUN", "colun", "Colún") en una sola.
 * Regla: si está en `canonicas` (data/marcas.csv, editable) gana esa; si no, la variante más
 * usada que no esté toda en mayúsculas o minúsculas.
 */
export class CatalogoMarcas {
  private readonly conteo = new Map<string, Map<string, number>>();
  private readonly fijas = new Map<string, string>();
  private elegidas: Map<string, string> | null = null;

  constructor(canonicas: Iterable<string> = []) {
    for (const m of canonicas) this.fijas.set(claveTexto(m), m);
  }

  agregar(marca: string): void {
    const m = limpiarTexto(marca);
    const clave = claveTexto(m);
    if (clave === '') return;
    const variantes = this.conteo.get(clave) ?? new Map<string, number>();
    variantes.set(m, (variantes.get(m) ?? 0) + 1);
    this.conteo.set(clave, variantes);
    this.elegidas = null;
  }

  private elegir(variantes: Map<string, number>): string {
    let mejor = '';
    let mejorPuntaje = -Infinity;
    for (const [v, n] of variantes) {
      const puntaje = (malCapitalizada(v) ? 0 : 1_000_000) + n;
      if (puntaje > mejorPuntaje) {
        mejor = v;
        mejorPuntaje = puntaje;
      }
    }
    if (todoMinusculas(mejor)) return tipoTitulo(mejor);
    return arreglarMayusculas(mejor);
  }

  /** Forma canónica de la marca; '' si no hay marca. */
  canonica(marca: string): string {
    const m = limpiarTexto(marca);
    const clave = claveTexto(m);
    if (clave === '') return '';
    const fija = this.fijas.get(clave);
    if (fija) return fija;
    if (this.elegidas === null) {
      this.elegidas = new Map([...this.conteo].map(([k, vs]) => [k, this.elegir(vs)]));
    }
    return this.elegidas.get(clave) ?? this.elegir(new Map([[m, 1]]));
  }
}
