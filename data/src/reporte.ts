import type { Categoria } from './categorias.js';
import type { ProductoSemilla } from './construir.js';
import type { MotivoDescarte } from './lector.js';

export interface DatosReporte {
  fecha: string;
  fuentes: { nombre: string; filas: number; candidatos: number; exportDel: string | null }[];
  descartes: Partial<Record<MotivoDescarte, number>>;
  sinNombre: number;
  productos: ProductoSemilla[];
  taxonomia: Map<string, Categoria>;
  plantillas: number;
}

const miles = (n: number) => n.toLocaleString('es-CL');
const pct = (n: number, total: number) =>
  total === 0 ? '–' : `${((100 * n) / total).toFixed(1).replace('.', ',')} %`;

function contar<T>(xs: T[], clave: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(clave(x), (m.get(clave(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Categoría de primer nivel (la del padre si es subcategoría). */
function raiz(slug: string, taxonomia: Map<string, Categoria>): string {
  const c = taxonomia.get(slug);
  return c?.padre ?? slug;
}

/** Reporte de cobertura en Markdown (data/reporte.md). */
export function generarReporte(d: DatosReporte): string {
  const ps = d.productos;
  const total = ps.length;
  const n = (f: (p: ProductoSemilla) => boolean) => ps.filter(f).length;
  const nombreCat = (slug: string) => d.taxonomia.get(slug)?.nombre ?? slug;
  const fila = (etiqueta: string, x: number, base = total) =>
    `| ${etiqueta} | ${miles(x)} | ${pct(x, base)} |`;

  const tramos: [string, (q: number) => boolean][] = [
    ['80–100', (q) => q >= 80],
    ['50–79', (q) => q >= 50 && q < 80],
    ['25–49', (q) => q >= 25 && q < 50],
    ['0–24', (q) => q < 25],
  ];
  const conCategoria = n((p) => p.categorySlug !== 'otros');

  return [
    '# Reporte de cobertura de la base semilla',
    '',
    `Generado por \`pnpm data:build\` el ${d.fecha}. No editar a mano.`,
    '',
    '## Fuentes',
    '',
    '| Fuente | Filas leídas | Candidatos (Chile o 780) | Export del |',
    '|---|---:|---:|---|',
    ...d.fuentes.map(
      (f) => `| ${f.nombre} | ${miles(f.filas)} | ${miles(f.candidatos)} | ${f.exportDel ?? '–'} |`,
    ),
    '',
    `Descartados: ${miles(d.descartes.EAN_BALANZA ?? 0)} códigos de balanza, ` +
      `${miles(d.descartes.EAN_DIGITO ?? 0)} con dígito verificador malo, ` +
      `${miles(d.descartes.EAN_FORMATO ?? 0)} con formato malo y ` +
      `${miles(d.sinNombre)} sin nombre en ninguna fuente.`,
    '',
    `## Productos en la semilla: ${miles(total)}`,
    '',
    '| | Productos | % |',
    '|---|---:|---:|',
    fila(
      'Etiqueta `en:chile`',
      n((p) => p.origin === 'TAG_CHILE'),
    ),
    fila(
      'Solo prefijo 780 (score a la mitad)',
      n((p) => p.origin === 'PREFIJO_780'),
    ),
    fila(
      'Lista curada',
      n((p) => p.origin === 'CURADO'),
    ),
    fila(
      'Con marca',
      n((p) => p.brand !== null),
    ),
    fila(
      'Con formato',
      n((p) => p.quantityText !== null),
    ),
    fila('Con categoría (≠ Otros)', conCategoria),
    fila(
      '— por etiqueta de OFF',
      n((p) => p.categoryVia === 'ETIQUETA'),
    ),
    fila(
      '— por palabra del nombre',
      n((p) => p.categoryVia === 'PALABRA'),
    ),
    fila(
      '— por fuente (cosmética, mascotas)',
      n((p) => p.categoryVia === 'FUENTE'),
    ),
    fila(
      'Con imagen',
      n((p) => p.imageUrl !== null),
    ),
    '',
    '## quality_score',
    '',
    '| Tramo | Productos | % |',
    '|---|---:|---:|',
    ...tramos.map(([t, f]) =>
      fila(
        t,
        n((p) => f(p.qualityScore)),
      ),
    ),
    '',
    '## Categorías',
    '',
    '| Categoría | Productos | % |',
    '|---|---:|---:|',
    ...contar(ps, (p) => raiz(p.categorySlug, d.taxonomia)).map(([slug, x]) =>
      fila(nombreCat(slug), x),
    ),
    '',
    `Plantillas sin código: ${miles(d.plantillas)}.`,
    '',
  ].join('\n');
}
