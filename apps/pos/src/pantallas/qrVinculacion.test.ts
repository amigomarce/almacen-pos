// @vitest-environment node
/**
 * El QR de vinculación debe poder leerse con un lector real (zxing, como el de la cámara del
 * celular). Si un cambio en el dibujo lo rompe, el dueño no puede vincular la caja.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { toQR } from 'toqr';
import { describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { trazoQr } from './PantallaConfiguracion.js';

const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) },
});

/** Pinta el trazo del SVG en una imagen RGBA, `px` píxeles por módulo. */
function rasterizar(texto: string, px: number) {
  const { trazo, total } = trazoQr(texto);
  const n = total * px;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (const m of trazo.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    for (let dy = 0; dy < px; dy++) {
      for (let dx = 0; dx < px; dx++) {
        const o = ((y * px + dy) * n + (x * px + dx)) * 4;
        data[o] = data[o + 1] = data[o + 2] = 0;
      }
    }
  }
  return { data, width: n, height: n, colorSpace: 'srgb' as const };
}

describe('QR de vinculación', () => {
  const texto =
    'almacenpos://vincular?' +
    new URLSearchParams({
      instalacion: '01a18a0b-bb2a-7753-9edb-c1ee3bc1214f',
      token: 'Zq3v9KxP2mN7bR4tW8yA1cE5gH6jL0oS_-uIdFkQwXe',
      caja: 'Caja 1',
    }).toString();

  it('un lector de QR lee exactamente el enlace de vinculación', async () => {
    const [leido] = await readBarcodes(rasterizar(texto, 3), { formats: ['QRCode'] });
    expect(leido?.text).toBe(texto);
  });

  it('usa corrección baja (L): el QR menos denso para este largo', () => {
    // 41 módulos + 8 de margen; con corrección M serían 49 + 8.
    // `ECLevel` de toqr es un const enum sin exportar: M = 0, L = 1.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment -- valores de toqr
    const nivel = (n: number) => n as NonNullable<Parameters<typeof toQR>[1]>;
    expect(trazoQr(texto).total).toBe(Math.sqrt(toQR(texto, nivel(1)).length) + 8);
    expect(trazoQr(texto).total).toBeLessThan(Math.sqrt(toQR(texto, nivel(0)).length) + 8);
  });
});
