import { useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type EstadoServidor } from './api.js';

export type Conexion =
  | { tipo: 'CARGANDO' }
  | { tipo: 'OK'; estado: EstadoServidor }
  | { tipo: 'ERROR'; mensaje: string };

/**
 * Consulta `/health` al iniciar y luego cada `intervaloMs`. Mientras el servidor no responde
 * (por ejemplo, al encender el PC: en Windows el primer arranque tarda), reintenta cada
 * `reintentoMs` para que la caja quede lista apenas el servidor lo esté.
 */
export function useEstadoServidor(
  cliente: ClienteApi,
  intervaloMs = 5000,
  reintentoMs = 1000,
): Conexion {
  const [conexion, setConexion] = useState<Conexion>({ tipo: 'CARGANDO' });

  useEffect(() => {
    let vigente = true;
    let id: ReturnType<typeof setTimeout> | undefined;
    const consultar = async (): Promise<void> => {
      let ok = false;
      try {
        const estado = await cliente.estado();
        ok = true;
        if (vigente) setConexion({ tipo: 'OK', estado });
      } catch (e) {
        const mensaje = e instanceof ErrorApi ? e.message : 'Error desconocido';
        if (vigente) setConexion({ tipo: 'ERROR', mensaje });
      }
      if (vigente) id = setTimeout(() => void consultar(), ok ? intervaloMs : reintentoMs);
    };
    void consultar();
    return () => {
      vigente = false;
      clearTimeout(id);
    };
  }, [cliente, intervaloMs, reintentoMs]);

  return conexion;
}
