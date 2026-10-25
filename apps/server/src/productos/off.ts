/**
 * Consulta en línea a Open Food Facts (OFF) cuando un código no está en el local ni en la
 * semilla. Reglas (https://openfoodfacts.github.io/openfoodfacts-server/api/, revisado el
 * 25-oct-2026): 15 req/min por IP para leer productos y User-Agent `App/Versión (contacto)`.
 *
 * - Nunca bloquea la caja: timeout corto y, ante cualquier error, "no encontrado".
 * - Limitador propio de 10 req/min, por debajo del límite de OFF.
 * - Caché en memoria de encontrados, de "no encontrado" y de fallos recientes (para no
 *   esperar el timeout en cada escaneo cuando no hay internet).
 * - Normaliza con el mismo código de `data/` que arma la semilla (nombre de góndola,
 *   marca canónica, formato y categoría).
 * - Los datos de OFF están bajo ODbL: la atribución se muestra en "Acerca de" (ADR-004).
 */
import { CatalogoMarcas, normalizarProducto, type Normalizacion } from '@almacen/data';
import type { ProductoSugerido } from './lookup.js';

export const URL_OFF = 'https://world.openfoodfacts.org';
const CAMPOS = 'code,product_name,generic_name,brands,quantity,categories_tags,image_url';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export interface OpcionesClienteOff {
  /** Versión de la app para el User-Agent. */
  version: string;
  /** Email o URL de contacto (variable `ALMACEN_CONTACTO`). OFF lo exige. */
  contacto: string;
  normalizacion: Normalizacion;
  fetch?: typeof fetch;
  /** Reloj inyectable para tests. */
  ahora?: () => number;
  timeoutMs?: number;
  maxPorMinuto?: number;
  ttlEncontradoMs?: number;
  ttlNoEncontradoMs?: number;
  ttlFalloMs?: number;
  maxCache?: number;
  urlBase?: string;
}

/** Por qué no hubo producto (sirve para logs y tests; la caja solo ve NO_ENCONTRADO). */
export type MotivoSinProducto = 'NO_EXISTE' | 'SIN_NOMBRE' | 'LIMITE' | 'FALLO';

export type RespuestaOff =
  { ok: true; producto: ProductoSugerido } | { ok: false; motivo: MotivoSinProducto };

interface FichaOff {
  product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  quantity?: unknown;
  categories_tags?: unknown;
  image_url?: unknown;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

interface EntradaCache {
  respuesta: RespuestaOff;
  vence: number;
}

export class ClienteOff {
  readonly userAgent: string;
  private readonly fetch: typeof fetch;
  private readonly ahora: () => number;
  private readonly marcas: CatalogoMarcas;
  private readonly cache = new Map<string, EntradaCache>();
  private readonly enCurso = new Map<string, Promise<RespuestaOff>>();
  private consultas: number[] = [];

  constructor(private readonly o: OpcionesClienteOff) {
    this.userAgent = `AlmacenPOS/${o.version} (${o.contacto})`;
    this.fetch = o.fetch ?? globalThis.fetch;
    this.ahora = o.ahora ?? Date.now;
    this.marcas = new CatalogoMarcas(o.normalizacion.marcasCanonicas);
  }

  /** `barcode` ya normalizado y que no sea de balanza (lo garantiza el lookup). */
  async buscar(barcode: string): Promise<RespuestaOff> {
    const ahora = this.ahora();
    const guardada = this.cache.get(barcode);
    if (guardada && guardada.vence > ahora) return guardada.respuesta;
    this.cache.delete(barcode);

    // Dos cajas escaneando lo mismo a la vez: una sola consulta.
    const pendiente = this.enCurso.get(barcode);
    if (pendiente) return pendiente;

    this.consultas = this.consultas.filter((t) => t > ahora - MINUTO);
    if (this.consultas.length >= (this.o.maxPorMinuto ?? 10))
      return { ok: false, motivo: 'LIMITE' };
    this.consultas.push(ahora);

    const promesa = this.consultar(barcode).finally(() => this.enCurso.delete(barcode));
    this.enCurso.set(barcode, promesa);
    const respuesta = await promesa;
    this.guardar(barcode, respuesta);
    return respuesta;
  }

  private guardar(barcode: string, r: RespuestaOff): void {
    if (!r.ok && r.motivo === 'LIMITE') return;
    const ttl = r.ok
      ? (this.o.ttlEncontradoMs ?? 24 * HORA)
      : r.motivo === 'FALLO'
        ? (this.o.ttlFalloMs ?? MINUTO)
        : (this.o.ttlNoEncontradoMs ?? HORA);
    const max = this.o.maxCache ?? 2000;
    // Map conserva el orden de inserción: se descarta la más antigua.
    while (this.cache.size >= max) {
      const primera = this.cache.keys().next();
      if (primera.done) break;
      this.cache.delete(primera.value);
    }
    this.cache.set(barcode, { respuesta: r, vence: this.ahora() + ttl });
  }

  private async consultar(barcode: string): Promise<RespuestaOff> {
    const url = `${this.o.urlBase ?? URL_OFF}/api/v2/product/${barcode}?fields=${CAMPOS}`;
    try {
      const res = await this.fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 2500),
      });
      if (res.status === 404) return { ok: false, motivo: 'NO_EXISTE' };
      if (!res.ok) return { ok: false, motivo: 'FALLO' };
      const cuerpo = (await res.json()) as { status?: unknown; product?: FichaOff };
      if (cuerpo.status !== 1 || !cuerpo.product) return { ok: false, motivo: 'NO_EXISTE' };
      const producto = this.normalizar(barcode, cuerpo.product);
      return producto ? { ok: true, producto } : { ok: false, motivo: 'SIN_NOMBRE' };
    } catch {
      // Sin internet, DNS, timeout o JSON malo: la caja sigue como si no existiera.
      return { ok: false, motivo: 'FALLO' };
    }
  }

  /** Igual que en la semilla: sin nombre no sirve para la caja. */
  normalizar(barcode: string, ficha: FichaOff): ProductoSugerido | null {
    const nombre = texto(ficha.product_name) || texto(ficha.generic_name);
    if (nombre === '') return null;
    // OFF junta varias marcas con coma ("Colun, Colún"): se usa la primera.
    const marca = this.marcas.canonica(texto(ficha.brands).split(',')[0] ?? '');
    const n = normalizarProducto({ nombre, marca, cantidad: texto(ficha.quantity) });
    const tags = Array.isArray(ficha.categories_tags)
      ? ficha.categories_tags.filter((t): t is string => typeof t === 'string')
      : [];
    const categoria = this.o.normalizacion.mapeo.categorizar(tags, 'off', n.producto);
    const imagen = texto(ficha.image_url);
    return {
      barcode,
      name: n.nombre,
      brand: n.marca || null,
      format: n.formato?.texto ?? null,
      unit: 'UN',
      categorySlug: categoria.slug,
      imageUrl: imagen.startsWith('https://') ? imagen : null,
      seedRef: null,
    };
  }
}
