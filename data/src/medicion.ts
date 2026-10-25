import { esCodigoDeBalanza, validarCodigoBarras } from '@almacen/core';

/** Columnas del export que nos interesan para la semilla. */
export const COLUMNAS = [
  'code',
  'product_name',
  'brands',
  'quantity',
  'categories_tags',
  'countries_tags',
  'image_url',
  'last_modified_t',
] as const;
export type Columna = (typeof COLUMNAS)[number];
export type Fila = Record<Columna, string>;

export interface Conteo {
  filas: number;
  filasMalformadas: number;
  chile: number;
  soloChile: number;
  eanValido: number;
  eanBalanza: number;
  eanFormatoInvalido: number;
  eanDigitoInvalido: number;
  eanDuplicado: number;
  prefijoChile780: number;
  conNombre: number;
  conMarca: number;
  conCantidad: number;
  conCategoria: number;
  conImagen: number;
  /** EAN válido + nombre + marca + cantidad + categoría. */
  completos: number;
}

export function conteoVacio(): Conteo {
  return {
    filas: 0,
    filasMalformadas: 0,
    chile: 0,
    soloChile: 0,
    eanValido: 0,
    eanBalanza: 0,
    eanFormatoInvalido: 0,
    eanDigitoInvalido: 0,
    eanDuplicado: 0,
    prefijoChile780: 0,
    conNombre: 0,
    conMarca: 0,
    conCantidad: 0,
    conCategoria: 0,
    conImagen: 0,
    completos: 0,
  };
}

export function esDeChile(countriesTags: string): boolean {
  return countriesTags.split(',').includes('en:chile');
}

/** PRNG determinista (mulberry32) para muestras reproducibles. */
export function crearAleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cuenta filas de Chile y guarda una muestra aleatoria uniforme (reservoir sampling). */
export class Medidor {
  readonly conteo = conteoVacio();
  readonly muestra: Fila[] = [];
  private readonly vistos = new Set<string>();
  private readonly aleatorio: () => number;

  constructor(
    private readonly tamanoMuestra = 20,
    semilla = 2026,
  ) {
    this.aleatorio = crearAleatorio(semilla);
  }

  /** Procesa una fila; devuelve true si es de Chile. */
  agregar(fila: Fila): boolean {
    const c = this.conteo;
    c.filas++;
    if (!esDeChile(fila.countries_tags)) return false;
    c.chile++;
    if (fila.countries_tags === 'en:chile') c.soloChile++;

    const codigo = fila.code.trim();
    const r = validarCodigoBarras(codigo);
    let eanOk = false;
    if (!r.valido) {
      if (r.motivo === 'FORMATO') c.eanFormatoInvalido++;
      else c.eanDigitoInvalido++;
    } else if (r.tipo === 'EAN13' && esCodigoDeBalanza(codigo)) {
      c.eanBalanza++;
    } else {
      const canonico = r.tipo === 'UPCA' ? `0${codigo}` : codigo;
      if (this.vistos.has(canonico)) c.eanDuplicado++;
      else {
        this.vistos.add(canonico);
        eanOk = true;
        c.eanValido++;
        if (canonico.startsWith('780')) c.prefijoChile780++;
      }
    }

    const nombre = fila.product_name.trim() !== '';
    const marca = fila.brands.trim() !== '';
    const cantidad = fila.quantity.trim() !== '';
    const categoria = fila.categories_tags.trim() !== '';
    if (nombre) c.conNombre++;
    if (marca) c.conMarca++;
    if (cantidad) c.conCantidad++;
    if (categoria) c.conCategoria++;
    if (fila.image_url.trim() !== '') c.conImagen++;
    if (eanOk && nombre && marca && cantidad && categoria) c.completos++;

    // Reservoir sampling sobre todas las filas de Chile.
    if (this.muestra.length < this.tamanoMuestra) this.muestra.push(fila);
    else {
      const j = Math.floor(this.aleatorio() * c.chile);
      if (j < this.tamanoMuestra) this.muestra[j] = fila;
    }
    return true;
  }
}
