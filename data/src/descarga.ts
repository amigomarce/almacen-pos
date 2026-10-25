import { createWriteStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { USER_AGENT } from './fuentes.js';

interface MetaDescarga {
  url: string;
  etag: string | null;
  lastModified: string | null;
  bytes: number;
}

async function tamanoLocal(ruta: string): Promise<number> {
  try {
    return (await stat(ruta)).size;
  } catch {
    return 0;
  }
}

async function leerMeta(ruta: string): Promise<MetaDescarga | null> {
  try {
    return JSON.parse(await readFile(`${ruta}.meta.json`, 'utf8')) as MetaDescarga;
  } catch {
    return null;
  }
}

/**
 * Descarga `url` a `ruta`. No vuelve a bajar si el ETag/tamaño no cambió, y reanuda
 * (HTTP Range) una descarga a medias del mismo archivo.
 */
export async function descargar(url: string, ruta: string): Promise<MetaDescarga> {
  const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } });
  if (!head.ok) throw new Error(`HEAD ${url}: HTTP ${head.status}`);
  const remoto: MetaDescarga = {
    url,
    etag: head.headers.get('etag'),
    lastModified: head.headers.get('last-modified'),
    bytes: Number(head.headers.get('content-length') ?? 0),
  };

  const meta = await leerMeta(ruta);
  const local = await tamanoLocal(ruta);
  const mismoArchivo = meta?.etag === remoto.etag || (meta === null && local > 0);
  if (mismoArchivo && local === remoto.bytes) return remoto;

  const desde = mismoArchivo && local < remoto.bytes ? local : 0;
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (desde > 0) headers['Range'] = `bytes=${desde}-`;
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const anexar = desde > 0 && res.status === 206;
  await pipeline(
    Readable.fromWeb(res.body),
    createWriteStream(ruta, { flags: anexar ? 'a' : 'w' }),
  );
  await writeFile(`${ruta}.meta.json`, JSON.stringify(remoto, null, 2));
  return remoto;
}
