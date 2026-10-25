import { useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type EstadoServidor } from './api.js';

export type Conexion =
  | { tipo: 'CARGANDO' }
  | { tipo: 'OK'; estado: EstadoServidor }
  | { tipo: 'ERROR'; mensaje: string };

/** Consulta `/health` al iniciar y luego cada `intervaloMs`. */
export function useEstadoServidor(cliente: ClienteApi, intervaloMs = 5000): Conexion {
  const [conexion, setConexion] = useState<Conexion>({ tipo: 'CARGANDO' });

  useEffect(() => {
    let vigente = true;
    const consultar = async (): Promise<void> => {
      try {
        const estado = await cliente.estado();
        if (vigente) setConexion({ tipo: 'OK', estado });
      } catch (e) {
        const mensaje = e instanceof ErrorApi ? e.message : 'Error desconocido';
        if (vigente) setConexion({ tipo: 'ERROR', mensaje });
      }
    };
    void consultar();
    const id = setInterval(() => void consultar(), intervaloMs);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, [cliente, intervaloMs]);

  return conexion;
}
