import { useEffect, useMemo, useState } from 'react';
import { toQR } from 'toqr';
import {
  ErrorApi,
  type CambiosConfiguracion,
  type ClienteApi,
  type ConfigImpresora,
  type ConfiguracionInicial,
  type ConfiguracionLocal,
  type ModalidadBoleta,
  type RespaldoLocal,
} from '../api.js';

const MODALIDADES: Record<ModalidadBoleta, { titulo: string; detalle: string }> = {
  PUENTE_MANUAL: {
    titulo: 'Emito la boleta en la app e-Boleta del SII',
    detalle:
      'La caja imprime un comprobante de venta y te recuerda emitir la boleta por el total. Recomendado por ahora.',
  },
  MOCK: {
    titulo: 'Modo prueba',
    detalle: 'No emite boletas. Solo para probar la caja: muestra el aviso "MODO PRUEBA".',
  },
  SII_DIRECTO: {
    titulo: 'Boleta electrónica desde la caja',
    detalle:
      'La caja timbra e imprime la boleta y la envía al SII. Requiere certificado digital y CAF cargados.',
  },
  PROVEEDOR_EXTERNO: { titulo: 'Proveedor de boletas', detalle: 'Disponible más adelante.' },
};

const PREFIJOS = Array.from({ length: 10 }, (_, i) => `2${i}`);

const TRANSPORTES: { valor: ConfigImpresora['transporte']; etiqueta: string }[] = [
  { valor: 'DESACTIVADA', etiqueta: 'Sin impresora' },
  { valor: 'SISTEMA', etiqueta: 'Impresora instalada en este equipo (USB)' },
  { valor: 'RED', etiqueta: 'Impresora de red (IP)' },
  { valor: 'ARCHIVO', etiqueta: 'Archivo o dispositivo (pruebas)' },
];

const vacioANull = (v: string) => (v.trim() === '' ? null : v.trim());

function SeccionLocal({ api }: { api: ClienteApi }) {
  const [config, setConfig] = useState<ConfiguracionLocal | null>(null);
  const [form, setForm] = useState({
    razonSocial: '',
    rut: '',
    giro: '',
    direccion: '',
    comuna: '',
  });
  const [modalidad, setModalidad] = useState<ModalidadBoleta>('PUENTE_MANUAL');
  const [modelo, setModelo] = useState<ConfiguracionLocal['modeloEmision']>('SOLO_NO_ELECTRONICOS');
  const [redondeo, setRedondeo] = useState(true);
  const [prefijos, setPrefijos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const aplicar = (c: ConfiguracionLocal) => {
    setConfig(c);
    setForm({
      razonSocial: c.razonSocial ?? '',
      rut: c.rut ?? '',
      giro: c.giro ?? '',
      direccion: c.direccion ?? '',
      comuna: c.comuna ?? '',
    });
    setModalidad(c.dteProvider);
    setModelo(c.modeloEmision);
    setRedondeo(c.cashRoundingEnabled);
    setPrefijos(c.prefijosBalanzaPrecio ?? []);
  };

  useEffect(() => {
    api
      .configuracion()
      .then(aplicar)
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la configuración');
      });
  }, [api]);

  if (!config) {
    return (
      <p className="mensaje-error" role="alert">
        {error}
      </p>
    );
  }

  const guardar = async () => {
    const cambios: CambiosConfiguracion = {};
    const texto = (campo: keyof typeof form) => {
      const nuevo = vacioANull(form[campo]);
      if (nuevo !== (config[campo] ?? null)) cambios[campo] = nuevo;
    };
    texto('razonSocial');
    texto('rut');
    texto('giro');
    texto('direccion');
    texto('comuna');
    if (modalidad !== config.dteProvider) cambios.dteProvider = modalidad;
    if (modelo !== config.modeloEmision) cambios.modeloEmision = modelo;
    if (redondeo !== config.cashRoundingEnabled) cambios.cashRoundingEnabled = redondeo;
    const antes = [...(config.prefijosBalanzaPrecio ?? [])].sort().join(',');
    if ([...prefijos].sort().join(',') !== antes) cambios.prefijosBalanzaPrecio = prefijos;
    if (Object.keys(cambios).length === 0) {
      setAviso('No hay cambios que guardar.');
      return;
    }
    try {
      aplicar(await api.guardarConfiguracion(cambios));
      setAviso('Configuración guardada.');
      window.dispatchEvent(new Event('almacen:configuracion'));
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
      setAviso(null);
    }
  };

  const campo = (etiqueta: string, nombre: keyof typeof form, max = 120) => (
    <label className="etiqueta-campo">
      {etiqueta}
      <input
        className="campo"
        maxLength={max}
        value={form[nombre]}
        onChange={(e) => {
          setForm({ ...form, [nombre]: e.target.value });
          setAviso(null);
        }}
      />
    </label>
  );

  const disponibles = config.modalidadesDisponibles ?? [config.dteProvider];

  return (
    <>
      <div className="tarjeta" id="datos-local">
        <h2>Datos del local</h2>
        <p className="suave">Aparecen en el comprobante impreso.</p>
        <div className="formulario">
          {campo('Nombre o razón social', 'razonSocial')}
          {campo('RUT', 'rut', 15)}
          {campo('Giro', 'giro')}
          {campo('Dirección', 'direccion')}
          {campo('Comuna', 'comuna')}
        </div>
      </div>

      <div className="tarjeta" id="boleta">
        <h2>Boleta</h2>
        <fieldset className="opciones">
          <legend>¿Cómo emites la boleta?</legend>
          {disponibles.map((m) => (
            <label key={m} className="opcion">
              <input
                type="radio"
                name="modalidad"
                checked={modalidad === m}
                onChange={() => {
                  setModalidad(m);
                  setAviso(null);
                }}
              />
              <span>
                <strong>{MODALIDADES[m].titulo}</strong>
                <span className="suave">{MODALIDADES[m].detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="opciones">
          <legend>Pagos con tarjeta</legend>
          <label className="opcion">
            <input
              type="radio"
              name="modelo"
              checked={modelo === 'SOLO_NO_ELECTRONICOS'}
              onChange={() => {
                setModelo('SOLO_NO_ELECTRONICOS');
              }}
            />
            <span>
              <strong>El voucher de la máquina es la boleta</strong>
              <span className="suave">
                Lo normal: la caja solo emite boleta en efectivo y transferencia.
              </span>
            </span>
          </label>
          <label className="opcion">
            <input
              type="radio"
              name="modelo"
              checked={modelo === 'TODO_MEDIO_PAGO'}
              onChange={() => {
                setModelo('TODO_MEDIO_PAGO');
              }}
            />
            <span>
              <strong>Emito boleta también con tarjeta</strong>
              <span className="suave">Solo si lo declaraste en sii.cl.</span>
            </span>
          </label>
        </fieldset>
        <label className="casilla">
          <input
            type="checkbox"
            checked={redondeo}
            onChange={(e) => {
              setRedondeo(e.target.checked);
            }}
          />
          Redondear el efectivo a la decena (Ley 20.956)
        </label>
      </div>

      <div className="tarjeta">
        <h2>Balanza</h2>
        <p className="suave">
          Marca los prefijos cuyas etiquetas traen el <strong>precio</strong>. Los demás se leen
          como peso.
        </p>
        <div className="fila fila-izquierda" role="group" aria-label="Prefijos con precio">
          {PREFIJOS.map((p) => (
            <label key={p} className="casilla">
              <input
                type="checkbox"
                checked={prefijos.includes(p)}
                onChange={(e) => {
                  setPrefijos(
                    e.target.checked ? [...prefijos, p] : prefijos.filter((x) => x !== p),
                  );
                }}
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <p className="mensaje-aviso" role="status">
        {aviso}
      </p>
      <button type="button" className="boton boton-cobrar" onClick={() => void guardar()}>
        Guardar configuración
      </button>
    </>
  );
}

function SeccionImpresora({ api }: { api: ClienteApi }) {
  const [cfg, setCfg] = useState<ConfigImpresora | null>(null);
  const [columnasEfectivas, setColumnasEfectivas] = useState<number | null>(null);
  const [colas, setColas] = useState<string[] | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'aviso'; texto: string } | null>(null);
  const [vista, setVista] = useState<string | null>(null);

  useEffect(() => {
    api
      .impresora()
      .then(({ columnasEfectivas: c, ...resto }) => {
        setCfg({
          transporte: resto.transporte,
          destino: resto.destino,
          anchoMm: resto.anchoMm,
          columnas: resto.columnas,
          paginaCodigos: resto.paginaCodigos,
          cortar: resto.cortar,
          abrirCajon: resto.abrirCajon,
        });
        setColumnasEfectivas(c);
      })
      .catch((e: unknown) => {
        setMensaje({
          tipo: 'error',
          texto: e instanceof ErrorApi ? e.message : 'No se pudo cargar la impresora',
        });
      });
  }, [api]);

  if (!cfg) {
    return (
      <p className="mensaje-error" role="alert">
        {mensaje?.texto}
      </p>
    );
  }

  const cambiar = (c: Partial<ConfigImpresora>) => {
    setCfg({ ...cfg, ...c });
    setMensaje(null);
  };
  const error = (e: unknown, porDefecto: string) => {
    setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : porDefecto });
  };

  const guardar = async () => {
    try {
      const r = await api.guardarImpresora(cfg);
      setColumnasEfectivas(r.columnasEfectivas);
      setMensaje({ tipo: 'aviso', texto: 'Impresora guardada.' });
      window.dispatchEvent(new Event('almacen:configuracion'));
    } catch (e) {
      error(e, 'No se pudo guardar la impresora');
    }
  };
  const probar = async () => {
    try {
      const r = await api.imprimirPrueba(cfg.abrirCajon);
      setVista(r.vistaPrevia);
      setMensaje({
        tipo: 'aviso',
        texto: r.impreso ? 'Prueba enviada a la impresora.' : 'No hay impresora configurada.',
      });
    } catch (e) {
      if (e instanceof ErrorApi && typeof e.datos['vistaPrevia'] === 'string')
        setVista(e.datos['vistaPrevia']);
      error(e, 'No se pudo imprimir');
    }
  };
  const cajon = async () => {
    try {
      const r = await api.abrirCajon();
      setMensaje({
        tipo: 'aviso',
        texto: r.abierto ? 'Cajón abierto.' : 'No hay impresora configurada.',
      });
    } catch (e) {
      error(e, 'No se pudo abrir el cajón');
    }
  };
  const buscarColas = async () => {
    try {
      setColas((await api.colasSistema()).colas);
    } catch (e) {
      error(e, 'No se pudieron listar las impresoras');
    }
  };

  return (
    <div className="tarjeta" id="impresora">
      <h2>Impresora</h2>
      <p className="suave">Guarda los cambios antes de imprimir la prueba.</p>
      <div className="formulario">
        <label className="etiqueta-campo">
          Conexión
          <select
            className="campo"
            value={cfg.transporte}
            onChange={(e) => {
              cambiar({ transporte: e.target.value as ConfigImpresora['transporte'] });
            }}
          >
            {TRANSPORTES.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {cfg.transporte !== 'DESACTIVADA' && (
          <label className="etiqueta-campo">
            {cfg.transporte === 'RED'
              ? 'Dirección IP'
              : cfg.transporte === 'SISTEMA'
                ? 'Nombre de la impresora'
                : 'Carpeta o dispositivo'}
            <input
              className="campo"
              placeholder={cfg.transporte === 'RED' ? '192.168.1.50' : ''}
              value={cfg.destino ?? ''}
              onChange={(e) => {
                cambiar({ destino: e.target.value });
              }}
            />
          </label>
        )}
        <label className="etiqueta-campo">
          Ancho del papel
          <select
            className="campo"
            value={cfg.anchoMm}
            onChange={(e) => {
              cambiar({ anchoMm: Number(e.target.value) as 58 | 80 });
            }}
          >
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </label>
        <label className="etiqueta-campo">
          Columnas (vacío = automático{columnasEfectivas ? `, ahora ${columnasEfectivas}` : ''})
          <input
            className="campo"
            inputMode="numeric"
            value={cfg.columnas ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 2);
              cambiar({ columnas: v === '' ? null : Number(v) });
            }}
          />
        </label>
        <label className="etiqueta-campo">
          Acentos (página de códigos)
          <select
            className="campo"
            value={cfg.paginaCodigos}
            onChange={(e) => {
              cambiar({ paginaCodigos: e.target.value as ConfigImpresora['paginaCodigos'] });
            }}
          >
            <option value="CP858">CP858 (Epson y la mayoría)</option>
            <option value="CP850">CP850</option>
            <option value="WPC1252">WPC1252</option>
          </select>
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={cfg.cortar}
            onChange={(e) => {
              cambiar({ cortar: e.target.checked });
            }}
          />
          Cortar el papel
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={cfg.abrirCajon}
            onChange={(e) => {
              cambiar({ abrirCajon: e.target.checked });
            }}
          />
          Abrir el cajón al cobrar en efectivo
        </label>
      </div>
      {cfg.transporte === 'SISTEMA' && (
        <div className="fila fila-izquierda">
          <button type="button" className="boton" onClick={() => void buscarColas()}>
            Buscar impresoras instaladas
          </button>
          {colas?.length === 0 && <span className="suave">No se encontraron impresoras.</span>}
          {colas?.map((c) => (
            <button
              key={c}
              type="button"
              className={cfg.destino === c ? 'boton boton-chico activo' : 'boton boton-chico'}
              onClick={() => {
                cambiar({ destino: c });
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <p className={mensaje?.tipo === 'error' ? 'mensaje-error' : 'mensaje-aviso'} role="alert">
        {mensaje?.texto}
      </p>
      <div className="fila fila-izquierda">
        <button type="button" className="boton activo" onClick={() => void guardar()}>
          Guardar impresora
        </button>
        <button type="button" className="boton" onClick={() => void probar()}>
          Imprimir prueba
        </button>
        <button type="button" className="boton" onClick={() => void cajon()}>
          Abrir cajón
        </button>
      </div>
      {vista && (
        <pre className="ticket" aria-label="Vista previa de la prueba">
          {vista}
        </pre>
      )}
    </div>
  );
}

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

const fechaRespaldo = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  });

function SeccionRespaldos({ api }: { api: ClienteApi }) {
  const [respaldos, setRespaldos] = useState<RespaldoLocal[]>([]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    api
      .respaldos()
      .then((r) => {
        setRespaldos(r.respaldos);
      })
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron leer los respaldos');
      });
  }, [api]);

  const crear = async () => {
    setCreando(true);
    setError(null);
    setAviso(null);
    try {
      const nuevo = await api.crearRespaldo();
      setRespaldos((previos) => [nuevo, ...previos]);
      setAviso('Respaldo creado.');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear el respaldo');
    } finally {
      setCreando(false);
    }
  };

  const ultimo = respaldos[0];

  return (
    <div className="tarjeta">
      <h2>Respaldos</h2>
      <p className="suave">
        La caja respalda sola una vez al día. Guarda una copia fuera de este equipo: si se pierde la
        caja, ese respaldo es lo que permite recuperar ventas y boletas.
      </p>
      {ultimo ? (
        <p>
          Último respaldo: <strong>{fechaRespaldo(ultimo.creadoEn)}</strong> ·{' '}
          {tamanoLegible(ultimo.tamanoBytes)}
          {ultimo.incluyeClaveSii ? ' · incluye la clave del SII' : ''}
        </p>
      ) : (
        <p>Todavía no hay respaldos.</p>
      )}
      <p className="suave">
        Se conservan los últimos 14. El respaldo incluye la clave del SII: guárdalo en un lugar
        seguro, porque sin ella no se pueden leer los datos tributarios.
      </p>
      <div className="fila fila-izquierda">
        <button type="button" className="boton" disabled={creando} onClick={() => void crear()}>
          {creando ? 'Respaldando…' : 'Respaldar ahora'}
        </button>
      </div>
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="mensaje-aviso" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}

function payloadVinculacion(v: ConfiguracionInicial['vinculacion']): string {
  const q = new URLSearchParams({
    instalacion: v.installationId,
    token: v.deviceToken,
    caja: v.caja,
  });
  return `almacenpos://vincular?${q.toString()}`;
}

/** Matriz QR generada en el navegador; no requiere red ni servicio externo. */
function MatrizQr({ texto }: { texto: string }) {
  const matriz = useMemo(() => toQR(texto), [texto]);
  const lado = Math.sqrt(matriz.length);
  const borde = 4;
  const total = lado + borde * 2;
  return (
    <svg
      className="qr"
      role="img"
      aria-label="Código QR para vincular el celular"
      viewBox={`0 0 ${total} ${total}`}
    >
      <rect width={total} height={total} fill="white" />
      {Array.from(matriz).map((valor, i) =>
        valor ? (
          <rect
            key={i}
            x={borde + (i % lado)}
            y={borde + Math.floor(i / lado)}
            width="1"
            height="1"
            fill="black"
          />
        ) : null,
      )}
    </svg>
  );
}

function Paso({
  numero,
  titulo,
  detalle,
  ok,
  enlace,
}: {
  numero: number;
  titulo: string;
  detalle: string;
  ok: boolean;
  enlace?: string;
}) {
  return (
    <li className={`paso ${ok ? 'paso-ok' : 'paso-pendiente'}`}>
      <span className="paso-numero" aria-hidden>
        {ok ? '✓' : numero}
      </span>
      <span className="paso-texto">
        <strong>{titulo}</strong>
        <span>{detalle}</span>
      </span>
      {!ok && enlace && <a href={enlace}>Completar</a>}
    </li>
  );
}

/** Guía de primera configuración: datos, boleta, impresora, escáner y celular. */
function SeccionPrimeraConfiguracion({ api }: { api: ClienteApi }) {
  const [setup, setSetup] = useState<ConfiguracionInicial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [probando, setProbando] = useState(false);
  const [escaneo, setEscaneo] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () => {
      api
        .configuracionInicial()
        .then((s) => {
          if (!vigente) return;
          setSetup(s);
          setError(null);
        })
        .catch((e: unknown) => {
          if (vigente)
            setError(e instanceof ErrorApi ? e.message : 'No se pudo leer la configuración');
        });
    };
    cargar();
    window.addEventListener('almacen:configuracion', cargar);
    return () => {
      vigente = false;
      window.removeEventListener('almacen:configuracion', cargar);
    };
  }, [api]);

  const probarCodigo = async () => {
    const valor = codigo.trim();
    if (valor === '') {
      setEscaneo({ ok: false, texto: 'Escanea o escribe un código primero.' });
      return;
    }
    setProbando(true);
    setEscaneo(null);
    try {
      const r = await api.buscarCodigo(valor);
      if ('error' in r) {
        setEscaneo({ ok: false, texto: (r as unknown as { mensaje: string }).mensaje });
      } else if (r.origen === 'NO_ENCONTRADO') {
        setEscaneo({ ok: true, texto: 'El lector funciona: el código no está en la base.' });
      } else {
        setEscaneo({ ok: true, texto: `Lector OK: ${r.producto.name}` });
      }
    } catch (e) {
      setEscaneo({
        ok: false,
        texto: e instanceof ErrorApi ? e.message : 'No se pudo consultar el código',
      });
    } finally {
      setProbando(false);
    }
  };

  const modalidad = setup ? MODALIDADES[setup.boleta.modalidad].titulo : '';

  return (
    <div className="tarjeta" id="primera-configuracion">
      <h2>Primera configuración</h2>
      <p className="suave">
        Deja la caja lista para vender. Puedes volver a esta guía cuando quieras.
      </p>
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      {setup && (
        <>
          <ol className="pasos">
            <Paso
              numero={1}
              titulo="Datos del local"
              ok={setup.local.completo}
              detalle={
                setup.local.completo
                  ? 'RUT, razón social, giro, dirección y comuna completos.'
                  : `Faltan: ${setup.local.faltan.join(', ')}.`
              }
              enlace="#datos-local"
            />
            <Paso
              numero={2}
              titulo="Forma de emitir la boleta"
              ok={setup.boleta.confirmada}
              detalle={
                setup.boleta.confirmada
                  ? `Modalidad: ${modalidad}.`
                  : 'Elige con la app del SII o desde esta caja.'
              }
              enlace="#boleta"
            />
            <Paso
              numero={3}
              titulo="Impresora"
              ok={setup.impresora.configurada}
              detalle={
                setup.impresora.configurada
                  ? `Configurada (${setup.impresora.transporte}).`
                  : 'Sin impresora configurada; revisa la sección de abajo.'
              }
              enlace="#impresora"
            />
          </ol>

          <div className="prueba-escaner">
            <h3>Prueba el lector</h3>
            <p className="suave">
              Escanea cualquier producto para comprobar que el lector y la búsqueda funcionan.
            </p>
            <div className="fila fila-izquierda">
              <label className="etiqueta-campo">
                Código de barras
                <input
                  className="campo"
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value);
                    setEscaneo(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void probarCodigo();
                  }}
                  placeholder="Escanea o escribe un código"
                />
              </label>
              <button
                type="button"
                className="boton"
                disabled={probando}
                onClick={() => void probarCodigo()}
              >
                {probando ? 'Probando…' : 'Probar código'}
              </button>
            </div>
            {escaneo && (
              <p
                className={escaneo.ok ? 'mensaje-aviso' : 'mensaje-error'}
                role={escaneo.ok ? 'status' : 'alert'}
              >
                {escaneo.texto}
              </p>
            )}
          </div>

          <div className="vinculacion">
            <h3>Vincula el celular del dueño</h3>
            <p className="suave">
              En la app del dueño entra a Caja → Vincular y escanea este código. También puedes
              escribir la instalación y el token a mano.
            </p>
            <MatrizQr texto={payloadVinculacion(setup.vinculacion)} />
            <p className="suave">
              Caja: {setup.vinculacion.caja} · Instalación: {setup.vinculacion.installationId}
            </p>
            <p className="aviso-privado">
              No compartas este código: permite vincular la caja a una cuenta.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Configuración del local (solo el dueño). */
export function PantallaConfiguracion({ api }: { api: ClienteApi }) {
  return (
    <section className="pantalla-caja">
      <SeccionPrimeraConfiguracion api={api} />
      <SeccionLocal api={api} />
      <SeccionImpresora api={api} />
      <SeccionRespaldos api={api} />
    </section>
  );
}
