// Corta con un mensaje claro si no es Node 22 (.nvmrc). Con Node 20, better-sqlite3 se cae
// (SIGSEGV) y los tests de la caja no arrancan, sin decir por qué.
import { readFileSync } from 'node:fs';

const esperada = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const actual = process.versions.node.split('.')[0];

if (actual !== esperada) {
  console.error(
    `\n✖ Este proyecto requiere Node ${esperada} y estás usando Node ${process.versions.node} (${process.execPath}).\n` +
      `  Usa: export PATH="/opt/homebrew/opt/node@${esperada}/bin:$PATH"   (o: nvm use)\n`,
  );
  process.exit(1);
}
