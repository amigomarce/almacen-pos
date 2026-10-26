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
      params[decodeURIComponent(parte.slice(0, i))] = decodeURIComponent(parte.slice(i + 1));
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
