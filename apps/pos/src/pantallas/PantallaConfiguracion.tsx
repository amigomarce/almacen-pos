import { useCallback, useEffect, useMemo, useState } from 'react';
import { toQR } from 'toqr';
import { Modal } from '../componentes/Modal.js';
import { SeccionPantallaCompleta } from '../configuracion/SeccionPantallaCompleta.js';
import { crearPantallaCompleta, type PantallaCompleta } from '../kiosco.js';
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
        {!disponibles.includes('SII_DIRECTO') &&
          config.siiListo === true &&
          config.siiAmbiente === 'certificacion' && (
            <p className="suave">
              La boleta desde la caja se habilita al terminar la certificación ante el SII: hoy
              están cargados los datos del ambiente de certificación.
            </p>
          )}
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

  const cargar = useCallback(() => {
    api
      .respaldos()
      .then((r) => {
        setRespaldos(r.respaldos);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron leer los respaldos');
      });
  }, [api]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
        <>
          <p>
            Último respaldo: <strong>{fechaRespaldo(ultimo.creadoEn)}</strong> ·{' '}
            {tamanoLegible(ultimo.tamanoBytes)}
            {ultimo.incluyeClaveSii ? ' · incluye la clave del SII' : ''}
          </p>
          {ultimo.nube?.subidoEn ? (
            <p className="suave">En la nube: {fechaRespaldo(ultimo.nube.subidoEn)}</p>
          ) : null}
          {ultimo.nube?.error ? <p className="mensaje-error">Nube: {ultimo.nube.error}</p> : null}
        </>
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
        <button type="button" className="boton boton-texto" onClick={cargar}>
          Actualizar estado
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

const QR_BORDE = 4;

/** Dibujo del QR: un solo trazo con los módulos oscuros, en coordenadas de módulo. */
export function trazoQr(texto: string): { trazo: string; total: number } {
  // Corrección de errores baja (L, la de `toqr` por omisión): en pantalla el QR no se daña y
  // es el menos denso.
  const matriz = toQR(texto);
  const lado = Math.sqrt(matriz.length);
  let trazo = '';
  matriz.forEach((valor, i) => {
    if (valor)
      trazo += `M${String(QR_BORDE + (i % lado))} ${String(QR_BORDE + Math.floor(i / lado))}h1v1h-1z`;
  });
  return { trazo, total: lado + QR_BORDE * 2 };
}

/**
 * Matriz QR generada en el navegador; no requiere red ni servicio externo. Cada módulo mide un
 * número entero de píxeles y se dibuja sin suavizado: con módulos de 3,5 px y costuras grises
 * la cámara del celular no lo reconocía.
 */
function MatrizQr({ texto, pxModulo = 7 }: { texto: string; pxModulo?: number }) {
  const { trazo, total } = useMemo(() => trazoQr(texto), [texto]);
  const lado = total * pxModulo;
  return (
    <svg
      className="qr"
      role="img"
      aria-label="Código QR para vincular el celular"
      viewBox={`0 0 ${String(total)} ${String(total)}`}
      width={lado}
      height={lado}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="white" />
      <path d={trazo} fill="black" />
    </svg>
  );
}

/** Píxeles por módulo para el QR ampliado: lo más grande que quepa en ~70 % del alto. */
function pxModuloAmpliado(texto: string): number {
  const { total } = trazoQr(texto);
  const alto = typeof window === 'undefined' ? 800 : window.innerHeight;
  return Math.max(8, Math.floor(Math.min(alto * 0.7, 600) / total));
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
  const [qrAmpliado, setQrAmpliado] = useState(false);
  const [verDatos, setVerDatos] = useState(false);

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
              En la app del dueño entra a Caja → Escanear QR de la caja y apunta a este código: se
              vincula sola. Si cuesta leerlo, usa Ampliar QR.
            </p>
            <MatrizQr texto={payloadVinculacion(setup.vinculacion)} />
            <div className="fila-botones">
              <button
                type="button"
                className="boton boton-chico"
                onClick={() => {
                  setQrAmpliado(true);
                }}
              >
                Ampliar QR
              </button>
              <button
                type="button"
                className="boton boton-chico"
                onClick={() => {
                  setVerDatos((v) => !v);
                }}
              >
                {verDatos ? 'Ocultar datos' : 'Ver datos para escribir a mano'}
              </button>
            </div>
            <p className="suave">
              Caja: {setup.vinculacion.caja} · Instalación: {setup.vinculacion.installationId}
            </p>
            {verDatos && (
              <p className="suave dato-vinculacion">
                Token: <code>{setup.vinculacion.deviceToken}</code>
              </p>
            )}
            {qrAmpliado && (
              <Modal
                titulo="Escanea con la app del dueño"
                alCerrar={() => {
                  setQrAmpliado(false);
                }}
              >
                <MatrizQr
                  texto={payloadVinculacion(setup.vinculacion)}
                  pxModulo={pxModuloAmpliado(payloadVinculacion(setup.vinculacion))}
                />
              </Modal>
            )}
            <p className="aviso-privado">
              No compartas este código: permite vincular la caja a una cuenta.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function SeccionNube({ api }: { api: ClienteApi }) {
  const [url, setUrl] = useState('');
  const [habilitado, setHabilitado] = useState(false);
  const [retencion, setRetencion] = useState(7);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    api
      .configuracion()
      .then((c) => {
        setUrl(c.cloudUrl ?? '');
        setHabilitado(c.cloudBackupEnabled ?? false);
        setRetencion(c.cloudBackupRetention ?? 7);
      })
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo leer la configuración de nube');
      });
  }, [api]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    setPrueba(null);
    try {
      const actualizada = await api.guardarConfiguracion({
        cloudUrl: url.trim() === '' ? null : url.trim(),
        cloudBackupEnabled: habilitado,
        cloudBackupRetention: retencion,
      });
      setUrl(actualizada.cloudUrl ?? '');
      setHabilitado(actualizada.cloudBackupEnabled ?? false);
      setRetencion(actualizada.cloudBackupRetention ?? 7);
      setAviso('Configuración de nube guardada.');
      window.dispatchEvent(new Event('almacen:configuracion'));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar la configuración de nube');
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const r = await api.probarNube();
      setPrueba(
        r.ok ? `Nube conectada (versión ${r.version ?? '?'})` : `La nube respondió ${r.status}`,
      );
    } catch (e) {
      setPrueba(e instanceof ErrorApi ? e.message : 'No se pudo probar la nube');
    } finally {
      setProbando(false);
    }
  };

  const verClave = async () => {
    setError(null);
    try {
      setClave((await api.claveRespaldo()).clave);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo obtener la clave de respaldo');
    }
  };

  return (
    <div className="tarjeta" id="nube">
      <h2>Nube y respaldo cifrado</h2>
      <p className="suave">
        La caja sincroniza con la nube y puede subir un respaldo cifrado una vez al día. La URL es
        la de <code>apps/cloud</code>, por ejemplo <code>https://api.tu-nube.cl</code>.
      </p>
      <div className="formulario">
        <label className="etiqueta-campo">
          Dirección de la nube
          <input
            className="campo"
            value={url}
            maxLength={300}
            onChange={(e) => {
              setUrl(e.target.value);
              setAviso(null);
            }}
            placeholder="https://api.tu-nube.cl"
          />
        </label>
        <label className="etiqueta-campo">
          Copias a conservar en la nube (1 a 30)
          <input
            className="campo"
            type="number"
            min={1}
            max={30}
            value={retencion}
            onChange={(e) => {
              setRetencion(Number(e.target.value));
              setAviso(null);
            }}
          />
        </label>
      </div>
      <label className="casilla">
        <input
          type="checkbox"
          checked={habilitado}
          onChange={(e) => {
            setHabilitado(e.target.checked);
            setAviso(null);
          }}
        />
        Respaldar automáticamente en la nube
      </label>
      <p className="suave">
        El respaldo se cifra con una clave que queda en este equipo. Descárgala y guárdala: sin ella
        no se puede restaurar un respaldo remoto.
      </p>
      <div className="fila fila-izquierda">
        <button type="button" className="boton" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar nube'}
        </button>
        <button type="button" className="boton" disabled={probando} onClick={() => void probar()}>
          {probando ? 'Probando…' : 'Probar conexión'}
        </button>
        <button type="button" className="boton boton-texto" onClick={() => void verClave()}>
          Ver clave de respaldo
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
      {prueba && <p className="mensaje-aviso">{prueba}</p>}
      {clave && (
        <div className="clave-respaldo">
          <p className="mensaje-error">
            Guarda esta clave fuera del equipo. No se puede recuperar desde la nube.
          </p>
          <code>{clave}</code>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(clave)}`}
            download="respaldo.key.txt"
          >
            Descargar clave
          </a>
        </div>
      )}
    </div>
  );
}

/** Configuración del local (solo el dueño). */
export function PantallaConfiguracion({
  api,
  pantalla,
  cajaAbierta = false,
}: {
  api: ClienteApi;
  /** Con un turno sin cerrar no se puede salir de pantalla completa. */
  cajaAbierta?: boolean;
  /** Inyectable para tests; por defecto controla la ventana de Tauri. */
  pantalla?: PantallaCompleta;
}) {
  const pantallaCompleta = useMemo(() => pantalla ?? crearPantallaCompleta(), [pantalla]);
  return (
    <section className="pantalla-caja">
      <SeccionPrimeraConfiguracion api={api} />
      <SeccionLocal api={api} />
      <SeccionImpresora api={api} />
      <SeccionRespaldos api={api} />
      <SeccionNube api={api} />
      <SeccionPantallaCompleta pantalla={pantallaCompleta} cajaAbierta={cajaAbierta} />
    </section>
  );
}
