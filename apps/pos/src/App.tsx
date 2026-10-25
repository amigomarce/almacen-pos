import { api as apiPorDefecto, type ClienteApi } from './api.js';
import { useEstadoServidor } from './useEstadoServidor.js';

export function App({ api = apiPorDefecto }: { api?: ClienteApi }) {
  const conexion = useEstadoServidor(api);

  return (
    <main className="app">
      <header className="barra">
        <h1>Almacén POS</h1>
        <EstadoConexion conexion={conexion} />
      </header>
      <section className="contenido">
        <p className="aviso">Caja en construcción (Fase 3).</p>
      </section>
    </main>
  );
}

function EstadoConexion({ conexion }: { conexion: ReturnType<typeof useEstadoServidor> }) {
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
