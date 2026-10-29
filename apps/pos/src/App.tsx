import { useCallback, useEffect, useState } from 'react';
import {
  api as apiPorDefecto,
  ErrorApi,
  type ClienteApi,
  type ConfiguracionLocal,
  type EstadoCaja,
  type Usuario,
} from './api.js';
import { AvisoCertificacion } from './componentes/AvisoCertificacion.js';
import { AvisoModoPrueba } from './componentes/AvisoModoPrueba.js';
import { ModalBoletaInicial } from './componentes/ModalBoletaInicial.js';
import { PantallaApertura } from './pantallas/PantallaApertura.js';
import { PantallaPin } from './pantallas/PantallaPin.js';
import { ModalAcercaDe } from './componentes/ModalAcercaDe.js';
import { PantallaCaja } from './pantallas/PantallaCaja.js';
import { PantallaInstalacion } from './pantallas/PantallaInstalacion.js';
import { PantallaFiado } from './pantallas/PantallaFiado.js';
import { PantallaConfiguracion } from './pantallas/PantallaConfiguracion.js';
import { PantallaProductos } from './pantallas/PantallaProductos.js';
import { PantallaRecepcion } from './pantallas/PantallaRecepcion.js';
import { PantallaVenta } from './pantallas/PantallaVenta.js';
import {
  escucharCierreBloqueado,
  MENSAJE_CIERRE_BLOQUEADO,
  type MotivoCierreBloqueado,
} from './kiosco.js';
import { guardarToken, leerToken } from './sesion.js';
import { useEstadoServidor, type Conexion } from './useEstadoServidor.js';

type Vista = 'VENTA' | 'PRODUCTOS' | 'RECEPCION' | 'FIADO' | 'CAJA' | 'CONFIGURACION';

const VISTAS: { vista: Vista; etiqueta: string; soloDueno?: boolean }[] = [
  { vista: 'VENTA', etiqueta: 'Venta' },
  { vista: 'PRODUCTOS', etiqueta: 'Productos' },
  { vista: 'RECEPCION', etiqueta: 'Recepción' },
  { vista: 'FIADO', etiqueta: 'Fiado' },
  { vista: 'CAJA', etiqueta: 'Caja' },
  { vista: 'CONFIGURACION', etiqueta: 'Configuración', soloDueno: true },
];

type Fase =
  | { tipo: 'CARGANDO' }
  | { tipo: 'INSTALACION' }
  | { tipo: 'PIN' }
  | { tipo: 'CAJA'; usuario: Usuario; caja: EstadoCaja | null; error: string | null };

export function App({ api = apiPorDefecto }: { api?: ClienteApi }) {
  const conexion = useEstadoServidor(api);
  // Con un token guardado se intenta retomar la sesión; sin token, directo al PIN.
  const [vista, setVista] = useState<Vista>('VENTA');
  const [acercaDe, setAcercaDe] = useState(false);
  // Configuración cargada junto al usuario: `null` con el mismo id = no se pudo leer.
  const [config, setConfig] = useState<{
    usuarioId: string;
    valor: ConfiguracionLocal | null;
  } | null>(null);
  const [fase, setFase] = useState<Fase>({ tipo: 'CARGANDO' });
  // Intento de cerrar la app (Alt+F4, botón de la ventana) rechazado por la caja abierta o la
  // pantalla completa (ADR-019).
  const [cierreBloqueado, setCierreBloqueado] = useState<MotivoCierreBloqueado | null>(null);
  useEffect(() => escucharCierreBloqueado(setCierreBloqueado), []);
  useEffect(() => {
    if (!cierreBloqueado) return;
    const id = setTimeout(() => {
      setCierreBloqueado(null);
    }, 8000);
    return () => {
      clearTimeout(id);
    };
  }, [cierreBloqueado]);
  const cajaAbierta = conexion.tipo === 'OK' && conexion.estado.cajaAbierta === true;
  // El servidor ya respondió alguna vez. Hasta entonces no se decide entre instalar y pedir
  // PIN: en Windows la ventana abre antes de que el servidor termine de arrancar, y sin esta
  // espera una instalación nueva quedaba en el PIN sin usuarios ("No hay conexión…").
  const [servidorVisto, setServidorVisto] = useState(false);
  if (conexion.tipo === 'OK' && !servidorVisto) setServidorVisto(true);

  const volverAlPin = useCallback(() => {
    guardarToken(null);
    api.usarToken(null);
    setConfig(null);
    // Si la base quedó sin usuarios (restauración, instalación a medias), vuelve a pedir la
    // configuración inicial en vez de mostrar una pantalla de PIN vacía.
    api
      .estadoInicial()
      .then((estado) => {
        setFase({ tipo: estado.requiereConfiguracion ? 'INSTALACION' : 'PIN' });
      })
      .catch(() => {
        setFase({ tipo: 'PIN' });
      });
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

  // Configuración del local: decide si falta la pregunta bloqueante de la modalidad.
  const usuarioId = fase.tipo === 'CAJA' ? fase.usuario.id : null;
  const configActual = usuarioId !== null && config?.usuarioId === usuarioId ? config.valor : null;
  const configPendiente = usuarioId !== null && config?.usuarioId !== usuarioId;
  useEffect(() => {
    if (!usuarioId) return;
    let vigente = true;
    api
      .configuracion()
      .then((c) => {
        if (vigente) setConfig({ usuarioId, valor: c });
      })
      .catch(() => {
        if (vigente) setConfig({ usuarioId, valor: null });
      });
    return () => {
      vigente = false;
    };
  }, [api, usuarioId, vista]);

  // Al iniciar (con el servidor ya arriba): se retoma la sesión guardada o se decide entre
  // instalar y pedir PIN.
  useEffect(() => {
    if (!servidorVisto) return;
    const token = leerToken();
    if (token) {
      api.usarToken(token);
      api
        .sesion()
        .then((r) => cargarCaja(r.usuario))
        .catch(volverAlPin);
      return;
    }
    let vigente = true;
    api
      .estadoInicial()
      .then((estado) => {
        if (vigente) setFase({ tipo: estado.requiereConfiguracion ? 'INSTALACION' : 'PIN' });
      })
      .catch(() => {
        if (vigente) setFase({ tipo: 'PIN' });
      });
    return () => {
      vigente = false;
    };
  }, [api, volverAlPin, cargarCaja, servidorVisto]);

  const alEntrar = (token: string, usuario: Usuario) => {
    setVista('VENTA');
    setConfig(null);
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
      {conexion.tipo === 'OK' && conexion.estado.ambienteCertificacion && <AvisoCertificacion />}
      {cierreBloqueado && (
        <div className="aviso-cierre" role="alert">
          {MENSAJE_CIERRE_BLOQUEADO[cierreBloqueado]}
          <button
            type="button"
            className="boton boton-chico"
            onClick={() => {
              setCierreBloqueado(null);
            }}
          >
            Entendido
          </button>
        </div>
      )}
      <header className="barra">
        <h1>Almacén POS</h1>
        {fase.tipo === 'CAJA' && (
          <nav className="pestanas" role="tablist" aria-label="Secciones">
            {VISTAS.filter((v) => !v.soloDueno || fase.usuario.role === 'DUENO').map((v) => (
              <button
                key={v.vista}
                type="button"
                role="tab"
                className="pestana"
                aria-selected={vista === v.vista}
                onClick={() => {
                  setVista(v.vista);
                }}
              >
                {v.etiqueta}
              </button>
            ))}
          </nav>
        )}
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
        <button
          type="button"
          className="boton boton-chico boton-texto"
          onClick={() => {
            setAcercaDe(true);
          }}
        >
          Acerca de
        </button>
      </header>
      {acercaDe && (
        <ModalAcercaDe
          api={api}
          alCerrar={() => {
            setAcercaDe(false);
          }}
        />
      )}
      <div className="contenido">
        {fase.tipo === 'CARGANDO' && (
          <p className="pantalla-centrada">
            {conexion.tipo === 'ERROR' ? 'Esperando al servidor de la caja…' : 'Cargando…'}
          </p>
        )}
        {fase.tipo === 'INSTALACION' && <PantallaInstalacion api={api} alEntrar={alEntrar} />}
        {fase.tipo === 'PIN' && <PantallaPin api={api} alEntrar={alEntrar} />}
        {fase.tipo === 'CAJA' &&
          (configPendiente ? (
            <p className="pantalla-centrada">Cargando configuración…</p>
          ) : configActual?.boletaConfirmada === false && vista !== 'CONFIGURACION' ? (
            <ModalBoletaInicial
              api={api}
              config={configActual}
              usuario={fase.usuario}
              alConfirmar={(actualizada) => {
                setConfig({ usuarioId: fase.usuario.id, valor: actualizada });
                setVista('CONFIGURACION');
              }}
              alSalir={() => void salir()}
            />
          ) : (
            <Caja
              fase={fase}
              vista={vista}
              api={api}
              reintentar={() => void cargarCaja(fase.usuario)}
              cajaAbierta={cajaAbierta}
              alAbrir={(caja) => {
                setFase({ ...fase, caja });
              }}
              alCerrarCaja={(caja) => {
                setFase({ ...fase, caja });
                setVista('VENTA');
              }}
            />
          ))}
      </div>
    </main>
  );
}

function Caja({
  fase,
  vista,
  api,
  reintentar,
  alAbrir,
  alCerrarCaja,
  cajaAbierta,
}: {
  fase: Extract<Fase, { tipo: 'CAJA' }>;
  /** Según el servidor (`/health`): algún turno sin cerrar en este equipo. */
  cajaAbierta: boolean;
  vista: Vista;
  api: ClienteApi;
  reintentar: () => void;
  alAbrir: (caja: EstadoCaja) => void;
  alCerrarCaja: (caja: EstadoCaja) => void;
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
  const esDueno = fase.usuario.role === 'DUENO';
  return (
    <>
      {/* La venta queda montada (oculta) al cambiar de pestaña: no se pierde el carrito. */}
      {fase.caja.sesion ? (
        <PantallaVenta api={api} activa={vista === 'VENTA'} />
      ) : (
        vista === 'VENTA' && (
          <PantallaApertura api={api} caja={fase.caja.caja.name} alAbrir={alAbrir} />
        )
      )}
      {vista === 'PRODUCTOS' && <PantallaProductos api={api} esDueno={esDueno} />}
      {vista === 'RECEPCION' && <PantallaRecepcion api={api} />}
      {vista === 'CAJA' && (
        <PantallaCaja api={api} esDueno={esDueno} alCambiarCaja={alCerrarCaja} />
      )}
      {vista === 'FIADO' && <PantallaFiado api={api} esDueno={esDueno} />}
      {vista === 'CONFIGURACION' && esDueno && (
        <PantallaConfiguracion api={api} cajaAbierta={cajaAbierta || fase.caja.sesion !== null} />
      )}
    </>
  );
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
