/**
 * Paso 1 de la Fase 2: medir la cobertura chilena de cada fuente (sin construir la semilla).
 *   pnpm --filter @almacen/data medir [--sin-descarga] [--solo=off,obf]
 * Deja en data/raw/: los exports .gz, <fuente>.chile.tsv (subconjunto chileno) y medicion.json.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { descargar } from './descarga.js';
import { FUENTES, type Fuente } from './fuentes.js';
import { COLUMNAS, Medidor, type Conteo, type Fila } from './medicion.js';

const RAW = join(dirname(fileURLToPath(import.meta.url)), '..', 'raw');
const sinDescarga = process.argv.includes('--sin-descarga');
const solo = process.argv
  .find((a) => a.startsWith('--solo='))
  ?.slice('--solo='.length)
  .split(',');

interface Resultado {
  fuente: Fuente['id'];
  nombre: string;
  bytesGz: number;
  lastModified: string | null;
  conteo: Conteo;
  muestra: Fila[];
}

async function medirFuente(fuente: Fuente): Promise<Resultado> {
  const archivo = join(RAW, fuente.url.split('/').at(-1) ?? `${fuente.id}.csv.gz`);
  const meta = sinDescarga
    ? { bytes: 0, lastModified: null }
    : await descargar(fuente.url, archivo);

  const medidor = new Medidor();
  const salida = createWriteStream(join(RAW, `${fuente.id}.chile.tsv`));
  const lineas = createInterface({
    input: createReadStream(archivo).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let indices: number[] | null = null;
  let anchoEsperado = 0;
  for await (const linea of lineas) {
    const campos = linea.split('\t');
    if (indices === null) {
      anchoEsperado = campos.length;
      indices = COLUMNAS.map((col) => {
        const i = campos.indexOf(col);
        if (i < 0) throw new Error(`${fuente.id}: falta la columna "${col}"`);
        return i;
      });
      salida.write(`${linea}\n`);
      continue;
    }
    if (campos.length !== anchoEsperado) medidor.conteo.filasMalformadas++;
    const fila = Object.fromEntries(
      COLUMNAS.map((col, k) => [col, campos[indices?.[k] ?? -1] ?? '']),
    ) as Fila;
    if (medidor.agregar(fila)) salida.write(`${linea}\n`);
  }
  await new Promise<void>((ok) => salida.end(ok));

  return {
    fuente: fuente.id,
    nombre: fuente.nombre,
    bytesGz: meta.bytes,
    lastModified: meta.lastModified,
    conteo: medidor.conteo,
    muestra: medidor.muestra,
  };
}

const pct = (n: number, total: number) => (total ? `${((100 * n) / total).toFixed(1)} %` : '–');

await mkdir(RAW, { recursive: true });
const resultados: Resultado[] = [];
for (const fuente of FUENTES.filter((f) => !solo || solo.includes(f.id))) {
  console.error(`→ ${fuente.nombre}…`);
  resultados.push(await medirFuente(fuente));
}
const nombreJson = solo ? `medicion.${solo.join('-')}.json` : 'medicion.json';
await writeFile(join(RAW, nombreJson), JSON.stringify(resultados, null, 2));

for (const r of resultados) {
  const c = r.conteo;
  console.log(`\n## ${r.nombre} (${(r.bytesGz / 1e6).toFixed(0)} MB gz, ${r.lastModified ?? '?'})`);
  console.log(`filas totales ${c.filas} (malformadas ${c.filasMalformadas})`);
  console.log(`Chile ${c.chile} (solo Chile ${c.soloChile})`);
  console.log(
    `EAN válido ${c.eanValido} ${pct(c.eanValido, c.chile)} | balanza ${c.eanBalanza} | formato ${c.eanFormatoInvalido} | dígito ${c.eanDigitoInvalido} | duplicados ${c.eanDuplicado} | prefijo 780 ${c.prefijoChile780}`,
  );
  console.log(
    `nombre ${pct(c.conNombre, c.chile)} | marca ${pct(c.conMarca, c.chile)} | cantidad ${pct(c.conCantidad, c.chile)} | categoría ${pct(c.conCategoria, c.chile)} | imagen ${pct(c.conImagen, c.chile)} | completos ${c.completos} ${pct(c.completos, c.chile)}`,
  );
}
