import { useEffect, useState } from 'react';
import { ErrorApi, type ClienteApi, type Usuario } from '../api.js';
import { TecladoNumerico } from '../componentes/TecladoNumerico.js';
import { useTeclado } from '../useTeclado.js';
import { useValorRapido } from '../useValorRapido.js';

const NOMBRE_ROL = { DUENO: 'Dueño', CAJERO: 'Cajero' } as const;
const PIN_MAX = 8;
const PIN_MIN = 4;

interface Props {
  api: ClienteApi;
  alEntrar: (token: string, usuario: Usuario) => void;
}

export function PantallaPin({ api, alEntrar }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [elegido, setElegido] = useState<Usuario | null>(null);
  const { valor: pin, cambiar: cambiarPin, leer: leerPin } = useValorRapido();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api
      .usuarios()
      .then((lista) => {
        if (!vigente) return;
        setUsuarios(lista);
        setErrorCarga(null);
        // Con un solo usuario no hay nada que elegir.
        if (lista.length === 1) setElegido(lista[0] ?? null);
      })
      .catch((e: unknown) => {
        if (vigente)
          setErrorCarga(
            e instanceof ErrorApi ? e.message : 'No se pudo cargar la lista de usuarios',
          );
      });
    return () => {
      vigente = false;
    };
  }, [api, intentoCarga]);

  const agregar = (d: string) => {
    setError(null);
    cambiarPin((p) => (p.length < PIN_MAX ? p + d : p));
  };
  const borrar = () => {
    cambiarPin((p) => p.slice(0, -1));
  };

  const entrar = async () => {
    const actual = leerPin();
    if (!elegido || actual.length < PIN_MIN || enviando) return;
    setEnviando(true);
    try {
      const r = await api.entrar(elegido.id, actual);
      alEntrar(r.token, r.usuario);
    } catch (e) {
      cambiarPin(() => '');
      if (e instanceof ErrorApi && e.codigo === 'PIN_INCORRECTO') {
        const n = Number(e.datos['intentosRestantes']);
        setError(`PIN incorrecto. Te quedan ${n} ${n === 1 ? 'intento' : 'intentos'}.`);
      } else {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo entrar');
      }
    } finally {
      setEnviando(false);
    }
  };

  useTeclado((e) => {
    if (/^[0-9]$/.test(e.key)) agregar(e.key);
    else if (e.key === 'Backspace') borrar();
    else if (e.key === 'Enter') void entrar();
    else if (e.key === 'Escape') {
      setElegido(null);
      cambiarPin(() => '');
      setError(null);
    }
  }, elegido !== null);

  if (errorCarga) {
    return (
      <section className="pantalla-centrada">
        <p className="mensaje-error" role="alert">
          {errorCarga}
        </p>
        <button
          type="button"
          className="boton"
          onClick={() => {
            setIntentoCarga((n) => n + 1);
          }}
        >
          Reintentar
        </button>
      </section>
    );
  }
  if (!usuarios) return <section className="pantalla-centrada">Cargando…</section>;

  if (!elegido) {
    return (
      <section className="pantalla-centrada">
        <h2>¿Quién atiende?</h2>
        {usuarios.length === 0 ? (
          <p className="mensaje-error">No hay usuarios activos. Pide al dueño que cree uno.</p>
        ) : (
          <div className="lista-usuarios">
            {usuarios.map((u) => (
              <button
                key={u.id}
                type="button"
                className="boton-usuario"
                onClick={() => {
                  setElegido(u);
                }}
              >
                <span className="boton-usuario-nombre">{u.name}</span>
                <span className="boton-usuario-rol">{NOMBRE_ROL[u.role]}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="pantalla-centrada">
      <h2>Hola, {elegido.name}</h2>
      <p>Ingresa tu PIN</p>
      <div className="puntos-pin" aria-label={`${pin.length} dígitos ingresados`}>
        {Array.from({ length: Math.max(PIN_MIN, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'punto lleno' : 'punto'} />
        ))}
      </div>
      <p className="mensaje-error" role="alert">
        {error}
      </p>
      <TecladoNumerico
        alDigito={agregar}
        alBorrar={borrar}
        alAceptar={() => void entrar()}
        etiquetaAceptar="Entrar"
        deshabilitado={enviando}
        aceptarDeshabilitado={pin.length < PIN_MIN}
      />
      {usuarios.length > 1 && (
        <button
          type="button"
          className="boton boton-texto"
          onClick={() => {
            setElegido(null);
            cambiarPin(() => '');
            setError(null);
          }}
        >
          Cambiar usuario
        </button>
      )}
    </section>
  );
}
