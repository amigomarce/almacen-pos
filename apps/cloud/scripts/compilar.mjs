/**
 * Compila la nube en un solo archivo para producción (Docker / Fly.io):
 * `dist/main.mjs` con Fastify, Drizzle, pg y los paquetes del monorepo adentro.
 * Las migraciones no se empaquetan: el contenedor las copia y las indica con
 * `CLOUD_MIGRACIONES`.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

await build({
  entryPoints: [`${raiz}src/main.ts`],
  outfile: `${raiz}dist/main.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // `pg` intenta cargar el driver nativo opcional; no se usa.
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
