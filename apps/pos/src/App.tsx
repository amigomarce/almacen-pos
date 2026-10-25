import { useCallback, useEffect, useState } from 'react';
import {
  api as apiPorDefecto,
  ErrorApi,
  type ClienteApi,
  type EstadoCaja,
  type Usuario,
} from './api.js';
import { AvisoModoPrueba } from './componentes/AvisoModoPrueba.js';
import { PantallaApertura } from './pantallas/PantallaApertura.js';
import { PantallaPin } from './pantallas/PantallaPin.js';
import { PantallaVenta } from './pantallas/PantallaVenta.js';
import { guardarToken, leerToken } from './sesion.js';
import { useEstadoServidor, type Conexion } from './useEstadoServidor.js';

type Fase =
  | { tipo: 'CARGANDO' }
  | { tipo: 'PIN' }
  | { tipo: 'CAJA'; usuario: Usuario; caja: EstadoCaja | null; error: string | null };

export function App({ api = apiPorDefecto }: { api?: ClienteApi }) {
  const conexion = useEstadoServidor(api);
  // Con un token guardado se intenta retomar la sesión; sin token, directo al PIN.
  const [fase, setFase] = useState<Fase>(() =>
    leerToken() ? { tipo: 'CARGANDO' } : { tipo: 'PIN' },
  );

  const volverAlPin = useCallback(() => {
    guardarToken(null);
    api.usarToken(null);
    setFase({ tipo: 'PIN' });
  }, [api]);

  const cargarCaja = useCallback(
    async (usuario: Usuario) => {
      setFase({ tipo: 'CAJA', usuario, caja: null, error: null });
      try {
        const caja = await api.estadoCaja();
        setFase({ tipo: 'CAJA', usuario, caja, error: null });
      } catch (e) {
        if (e instanceof ErrorApi && e.codigo === 'SIN_SESION') return;
        setFase({
          tipo: 'CAJA',
          usuario,
          caja: null,
          error: e instanceof ErrorApi ? e.message : 'No se pudo consultar la caja',
        });
      }
    },
    [api],
  );

  useEffect(() => api.alPerderSesion(volverAlPin), [api, volverAlPin]);

  // Al iniciar: si hay un token guardado y sigue vigente, se retoma la sesión.
  useEffect(() => {
    const token = leerToken();
    if (!token) return;
    api.usarToken(token);
    api
      .sesion()
      .then((r) => cargarCaja(r.usuario))
      .catch(volverAlPin);
  }, [api, volverAlPin, cargarCaja]);

  const alEntrar = (token: string, usuario: Usuario) => {
    guardarToken(token);
    api.usarToken(token);
    void cargarCaja(usuario);
  };

  const salir = async () => {
    try {
      await api.salir();
    } catch {
      // Igual se vuelve a la pantalla de PIN.
    }
    volverAlPin();
  };

  return (
    <main className="app">
      {conexion.tipo === 'OK' && conexion.estado.modoPrueba && <AvisoModoPrueba />}
      <header className="barra">
        <h1>Almacén POS</h1>
        {fase.tipo === 'CAJA' && (
          <div className="barra-usuario">
            <span>
              {fase.usuario.name}
              {fase.caja ? ` · ${fase.caja.caja.name}` : ''}
            </span>
            <button type="button" className="boton boton-chico" onClick={() => void salir()}>
              Salir
            </button>
          </div>
        )}
        <EstadoConexion conexion={conexion} />
      </header>
      <div className="contenido">
        {fase.tipo === 'CARGANDO' && <p className="pantalla-centrada">Cargando…</p>}
        {fase.tipo === 'PIN' && <PantallaPin api={api} alEntrar={alEntrar} />}
        {fase.tipo === 'CAJA' && (
          <Caja
            fase={fase}
            api={api}
            reintentar={() => void cargarCaja(fase.usuario)}
            alAbrir={(caja) => {
              setFase({ ...fase, caja });
            }}
          />
        )}
      </div>
    </main>
  );
}

function Caja({
  fase,
  api,
  reintentar,
  alAbrir,
}: {
  fase: Extract<Fase, { tipo: 'CAJA' }>;
  api: ClienteApi;
  reintentar: () => void;
  alAbrir: (caja: EstadoCaja) => void;
}) {
  if (fase.error) {
    return (
      <section className="pantalla-centrada">
        <p className="mensaje-error" role="alert">
          {fase.error}
        </p>
        <button type="button" className="boton" onClick={reintentar}>
          Reintentar
        </button>
      </section>
    );
  }
  if (!fase.caja) return <p className="pantalla-centrada">Cargando…</p>;
  if (!fase.caja.sesion)
    return <PantallaApertura api={api} caja={fase.caja.caja.name} alAbrir={alAbrir} />;
  return <PantallaVenta api={api} />;
}

function EstadoConexion({ conexion }: { conexion: Conexion }) {
  switch (conexion.tipo) {
    case 'CARGANDO':
      return <span className="estado">Conectando…</span>;
    case 'OK':
      return (
        <span className="estado estado-ok" role="status">
          Servidor conectado · v{conexion.estado.version}
          {conexion.estado.semilla ? '' : ' · sin base de productos'}
        </span>
      );
    case 'ERROR':
      return (
        <span className="estado estado-error" role="alert">
          {conexion.mensaje}
        </span>
      );
  }
}
