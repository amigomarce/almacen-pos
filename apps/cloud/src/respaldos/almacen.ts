import { ErrorDominio } from '@almacen/core';

type Fetch = typeof fetch;

/**
 * Almacenamiento de objetos. Supabase Storage es la implementación actual; mañana puede ser
 * S3, R2 o GCS sin tocar la lógica de respaldos.
 */
export interface AlmacenObjetos {
  subir(ruta: string, datos: Buffer, contentType: string): Promise<void>;
  descargar(ruta: string): Promise<Buffer>;
  eliminar(ruta: string): Promise<void>;
}

export interface OpcionesSupabaseStorage {
  /** `https://<proyecto>.supabase.co` */
  url: string;
  /** `service_role`: solo vive en apps/cloud, nunca en la caja ni en el móvil. */
  serviceKey: string;
  bucket: string;
  fetchFn?: Fetch;
}

const sinBarra = (url: string) => url.replace(/\/+$/, '');
const codificarRuta = (ruta: string) =>
  ruta
    .split('/')
    .map((parte) => encodeURIComponent(parte))
    .join('/');

/** Cliente HTTP mínimo de Supabase Storage (sin SDK). */
export function crearAlmacenSupabase(opciones: OpcionesSupabaseStorage): AlmacenObjetos {
  const base = sinBarra(opciones.url);
  const bucket = opciones.bucket.trim();
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(bucket)) {
    throw new ErrorDominio('BUCKET_INVALIDO', 'El nombre del bucket de respaldos no es válido');
  }
  const fetchFn = opciones.fetchFn ?? ((...args) => fetch(...args));
  const auth = {
    authorization: `Bearer ${opciones.serviceKey}`,
    apikey: opciones.serviceKey,
  };
  const objeto = (ruta: string) => `${base}/storage/v1/object/${bucket}/${codificarRuta(ruta)}`;

  return {
    async subir(ruta, datos, contentType) {
      const res = await fetchFn(objeto(ruta), {
        method: 'POST',
        headers: { ...auth, 'content-type': contentType, 'x-upsert': 'true' },
        body: datos,
      });
      if (!res.ok) {
        throw new ErrorDominio(
          'ALMACEN_ERROR',
          `Supabase Storage rechazó la subida (${res.status})`,
        );
      }
    },

    async descargar(ruta) {
      const res = await fetchFn(objeto(ruta), { headers: auth });
      if (res.status === 404) {
        throw new ErrorDominio('RESPALDO_NO_ENCONTRADO', 'El respaldo no existe en Storage');
      }
      if (!res.ok) {
        throw new ErrorDominio(
          'ALMACEN_ERROR',
          `Supabase Storage rechazó la descarga (${res.status})`,
        );
      }
      return Buffer.from(await res.arrayBuffer());
    },

    async eliminar(ruta) {
      const res = await fetchFn(objeto(ruta), { method: 'DELETE', headers: auth });
      if (!res.ok && res.status !== 404) {
        throw new ErrorDominio(
          'ALMACEN_ERROR',
          `Supabase Storage rechazó el borrado (${res.status})`,
        );
      }
    },
  };
}
