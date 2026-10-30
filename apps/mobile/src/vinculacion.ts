export interface DatosVinculacionQr {
  installationId: string;
  deviceToken: string;
  caja: string;
}

/**
 * Lee el QR que muestra la caja en Configuración → Primera configuración:
 * `almacenpos://vincular?instalacion=…&token=…&caja=…`.
 *
 * Se parsea a mano (sin `URL`) para no depender del soporte de esquemas custom en Hermes.
 */
export function parsearQrVinculacion(data: string): DatosVinculacionQr | null {
  const m = /^almacenpos:\/\/vincular\?(.+)$/.exec(data.trim());
  if (!m?.[1]) return null;
  const params: Record<string, string> = {};
  for (const parte of m[1].split('&')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    try {
      // La caja arma el QR con URLSearchParams, que codifica el espacio como "+" ("Caja+1").
      const decodificar = (t: string) => decodeURIComponent(t.replace(/\+/g, ' '));
      params[decodificar(parte.slice(0, i))] = decodificar(parte.slice(i + 1));
    } catch {
      return null;
    }
  }
  const installationId = params['instalacion'] ?? '';
  const deviceToken = params['token'] ?? '';
  if (!installationId || !deviceToken) return null;
  return {
    installationId,
    deviceToken,
    caja: params['caja'] || 'Caja 1',
  };
}

export type ResultadoLecturaQr =
  | { tipo: 'NO_ES_CAJA' }
  | { tipo: 'VINCULADA'; nombre: string }
  | { tipo: 'ERROR'; mensaje: string; datos: DatosVinculacionQr };

/**
 * Lo que pasa al leer un QR: si es de una caja, se vincula de inmediato (sin que el dueño tenga
 * que revisar y confirmar). Si falla, se devuelven los datos para dejarlos en el formulario.
 */
export async function vincularDesdeQr(
  data: string,
  vincular: (
    installationId: string,
    deviceToken: string,
    nombre: string,
  ) => Promise<{ name: string }>,
): Promise<ResultadoLecturaQr> {
  const datos = parsearQrVinculacion(data);
  if (!datos) return { tipo: 'NO_ES_CAJA' };
  try {
    const r = await vincular(datos.installationId, datos.deviceToken, datos.caja);
    return { tipo: 'VINCULADA', nombre: r.name };
  } catch (e) {
    return {
      tipo: 'ERROR',
      mensaje: e instanceof Error ? e.message : 'No se pudo vincular',
      datos,
    };
  }
}
