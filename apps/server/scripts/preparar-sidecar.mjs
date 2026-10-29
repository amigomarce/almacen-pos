#!/usr/bin/env node
/**
 * Prepara el servidor local para el instalador de Tauri:
 *
 * 1. Compila `apps/server/src/main.ts` con esbuild en un solo `server.mjs`.
 * 2. Copia `better-sqlite3` solo con el binario nativo del target.
 * 3. Copia migraciones, CSV de categorías/marcas y `seed.sqlite`.
 * 4. Copia el runtime de Node como sidecar `almacen-node-<target>` de Tauri. No se llama
 *    `node` porque en Linux el `.deb` lo instala en `/usr/bin` y chocaría con el Node del
 *    sistema (ADR-020).
 *
 * Uso (desde `apps/server`):
 *   pnpm sidecar
 *   pnpm sidecar -- --node /ruta/node.exe --target x86_64-pc-windows-msvc
 *   pnpm sidecar -- --node /ruta/node-v22-linux-x64/bin/node --target x86_64-unknown-linux-gnu
 *
 * El binario de Windows no se puede copiar desde macOS: hay que pasar `--node` con el
 * `node.exe` de la distribución oficial (o compilar en Windows/CI).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverDir = join(scriptDir, '..');
const raiz = join(serverDir, '..', '..');
const posDir = join(raiz, 'apps', 'pos');
const resources = join(posDir, 'src-tauri', 'resources', 'server');
const binDir = join(posDir, 'src-tauri', 'binaries');

let valores;
try {
  ({ values: valores } = parseArgs({
    options: {
      node: { type: 'string' },
      target: { type: 'string' },
    },
  }));
} catch {
  console.error('Uso: pnpm sidecar [--node <ruta al node.exe>] [--target <triple>]');
  process.exit(1);
}

function tripleActual() {
  if (process.platform === 'darwin') {
    return `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
  }
  if (process.platform === 'win32') {
    return `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`;
  }
  return `${process.arch === 'x64' ? 'x86_64' : 'aarch64'}-unknown-linux-gnu`;
}

/** Nombre del prebuild de better-sqlite3 para un target de Rust (glibc en Linux). */
function prebuildDe(triple) {
  const arch = triple.startsWith('aarch64') ? 'arm64' : 'x64';
  if (triple.includes('apple-darwin')) return `darwin-${arch}`;
  if (triple.includes('windows')) return `win32-${arch}`;
  if (triple.includes('linux-musl')) return `linuxmusl-${arch}`;
  return `linux-${arch}`;
}

const target = valores.target ?? tripleActual();
const esWindows = target.includes('windows');
const esActual = target === tripleActual();
if (
  !valores.node &&
  !process.env['ALMACEN_NODE'] &&
  /(^|\/)(opt\/homebrew|Cellar)(\/|$)/.test(process.execPath)
) {
  console.error('El Node de Homebrew no es autocontenido (depende de libnode y otras dylibs).');
  console.error('Descarga la distribución oficial de Node 22 y pasa --node <ruta>.');
  process.exit(1);
}
const nodeOrigen = valores.node ?? process.env['ALMACEN_NODE'] ?? process.execPath;
if (!esActual && !valores.node && !process.env['ALMACEN_NODE']) {
  console.error(
    `Para compilar para ${target} desde ${tripleActual()} hay que pasar --node con el runtime de esa plataforma.`,
  );
  process.exit(1);
}
if (!existsSync(nodeOrigen)) {
  console.error(`No existe el runtime de Node: ${nodeOrigen}`);
  process.exit(1);
}
const versionNode = execFileSync(nodeOrigen, ['--version'], { encoding: 'utf8' }).trim();
const majorNode = Number(versionNode.replace(/^v/, '').split('.')[0]);
if (!Number.isFinite(majorNode) || majorNode < 22) {
  console.error(`El runtime debe ser Node 22 o superior (es ${versionNode}).`);
  process.exit(1);
}

const seed = join(raiz, 'data', 'out', 'seed.sqlite');
if (!existsSync(seed)) {
  console.error(
    'Falta data/out/seed.sqlite. Ejecuta `pnpm data:build` o copia el artefacto de la base semilla.',
  );
  process.exit(1);
}

console.log(`Preparando sidecar para ${target}…`);
rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });

await build({
  entryPoints: [join(serverDir, 'src', 'main.ts')],
  outfile: join(resources, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});

// better-sqlite3 se queda externo para usar su addon nativo. El paquete trae prebuilds para
// todas las plataformas (~16 MB); solo viaja el del target, que es el único que carga.
const req = createRequire(join(serverDir, 'package.json'));
const paqueteSqlite = dirname(req.resolve('better-sqlite3/package.json'));
const destinoSqlite = join(resources, 'node_modules', 'better-sqlite3');
mkdirSync(destinoSqlite, { recursive: true });
for (const parte of ['package.json', 'LICENSE', 'lib']) {
  const origen = join(paqueteSqlite, parte);
  if (existsSync(origen)) cpSync(origen, join(destinoSqlite, parte), { recursive: true });
}
const prebuild = `${prebuildDe(target)}.node`;
const origenPrebuild = join(paqueteSqlite, 'prebuilds', prebuild);
if (!existsSync(origenPrebuild)) {
  console.error(`better-sqlite3 no trae binario para ${target} (${prebuild}).`);
  process.exit(1);
}
mkdirSync(join(destinoSqlite, 'prebuilds'), { recursive: true });
copyFileSync(origenPrebuild, join(destinoSqlite, 'prebuilds', prebuild));

cpSync(join(serverDir, 'drizzle'), join(resources, 'drizzle'), { recursive: true });

const dataDir = join(raiz, 'data');
const destinoData = join(resources, 'data');
mkdirSync(join(destinoData, 'out'), { recursive: true });
for (const archivo of [
  'categorias.csv',
  'mapeo_categorias.csv',
  'mapeo_palabras.csv',
  'marcas.csv',
]) {
  cpSync(join(dataDir, archivo), join(destinoData, archivo));
}
copyFileSync(seed, join(destinoData, 'out', 'seed.sqlite'));

mkdirSync(binDir, { recursive: true });
const destinoNode = join(binDir, `almacen-node-${target}${esWindows ? '.exe' : ''}`);
copyFileSync(nodeOrigen, destinoNode);
// Fuera el sidecar con el nombre anterior (`node-<target>`), ya copiado si era el origen.
rmSync(join(binDir, `node-${target}${esWindows ? '.exe' : ''}`), { force: true });
try {
  chmodSync(destinoNode, 0o755);
} catch {
  // En Windows chmod solo controla el bit de escritura; el archivo ya es ejecutable.
}

const mb = (ruta) => `${(statSync(ruta).size / 1024 / 1024).toFixed(1)} MB`;
console.log('');
console.log('Sidecar listo:');
console.log(
  `  servidor:      ${join(resources, 'server.mjs')} (${mb(join(resources, 'server.mjs'))})`,
);
console.log(`  better-sqlite3: ${destinoSqlite} (${prebuild})`);
console.log(
  `  seed:          ${join(destinoData, 'out', 'seed.sqlite')} (${mb(join(destinoData, 'out', 'seed.sqlite'))})`,
);
console.log(`  Node:          ${destinoNode} (${mb(destinoNode)})`);
