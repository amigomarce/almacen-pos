import { useState } from 'react';
import { ErrorApi, type ClienteApi, type DatosInstalacion, type Usuario } from '../api.js';

interface Props {
  api: ClienteApi;
  alEntrar: (token: string, usuario: Usuario) => void;
}

const PIN = /^\d{4,8}$/;

/**
 * Primer arranque de una instalación nueva: la base no tiene usuarios. Se crean el dueño, la
 * caja y, si se quiere, el cajero. Después se entra directo con la sesión recién creada.
 */
export function PantallaInstalacion({ api, alEntrar }: Props) {
  const [duenoNombre, setDuenoNombre] = useState('');
  const [duenoPin, setDuenoPin] = useState('');
  const [duenoPin2, setDuenoPin2] = useState('');
  const [cajaNombre, setCajaNombre] = useState('Caja 1');
  const [crearCajero, setCrearCajero] = useState(false);
  const [cajeroNombre, setCajeroNombre] = useState('');
  const [cajeroPin, setCajeroPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pin = (valor: string) => valor.replace(/\D/g, '').slice(0, 8);

  const instalar = async () => {
    setError(null);
    if (duenoNombre.trim() === '') {
      setError('Escribe el nombre del dueño');
      return;
    }
    if (!PIN.test(duenoPin)) {
      setError('El PIN debe tener entre 4 y 8 dígitos');
      return;
    }
    if (duenoPin !== duenoPin2) {
      setError('Los PIN no coinciden');
      return;
    }
    if (cajaNombre.trim() === '') {
      setError('Escribe el nombre de la caja');
      return;
    }
    if (crearCajero) {
      if (cajeroNombre.trim() === '') {
        setError('Escribe el nombre del cajero');
        return;
      }
      if (!PIN.test(cajeroPin)) {
        setError('El PIN del cajero debe tener entre 4 y 8 dígitos');
        return;
      }
    }

    setEnviando(true);
    try {
      const datos: DatosInstalacion = {
        dueno: { nombre: duenoNombre.trim(), pin: duenoPin },
        caja: { nombre: cajaNombre.trim() },
        ...(crearCajero ? { cajero: { nombre: cajeroNombre.trim(), pin: cajeroPin } } : {}),
      };
      const r = await api.instalarLocal(datos);
      alEntrar(r.token, r.usuario);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo configurar la caja');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="pantalla-centrada">
      <div className="tarjeta">
        <h2>Configura la caja</h2>
        <p className="suave">
          Es la primera vez que se abre esta caja. Crea el acceso del dueño y el nombre de la caja;
          después podrás completar los datos del local.
        </p>

        <div className="formulario">
          <label className="etiqueta-campo">
            Nombre del dueño
            <input
              className="campo"
              value={duenoNombre}
              autoFocus
              maxLength={40}
              onChange={(e) => {
                setDuenoNombre(e.target.value);
                setError(null);
              }}
              placeholder="Ej. Rosa"
            />
          </label>
          <label className="etiqueta-campo">
            PIN del dueño (4 a 8 dígitos)
            <input
              className="campo"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={duenoPin}
              onChange={(e) => {
                setDuenoPin(pin(e.target.value));
                setError(null);
              }}
            />
          </label>
          <label className="etiqueta-campo">
            Repite el PIN del dueño
            <input
              className="campo"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={duenoPin2}
              onChange={(e) => {
                setDuenoPin2(pin(e.target.value));
                setError(null);
              }}
            />
          </label>
          <label className="etiqueta-campo">
            Nombre de la caja
            <input
              className="campo"
              value={cajaNombre}
              maxLength={40}
              onChange={(e) => {
                setCajaNombre(e.target.value);
                setError(null);
              }}
            />
          </label>
        </div>

        <label className="casilla">
          <input
            type="checkbox"
            checked={crearCajero}
            onChange={(e) => {
              setCrearCajero(e.target.checked);
              setError(null);
            }}
          />
          Agregar un cajero (opcional)
        </label>
        {crearCajero && (
          <div className="formulario">
            <label className="etiqueta-campo">
              Nombre del cajero
              <input
                className="campo"
                value={cajeroNombre}
                maxLength={40}
                onChange={(e) => {
                  setCajeroNombre(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className="etiqueta-campo">
              PIN del cajero (4 a 8 dígitos)
              <input
                className="campo"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={cajeroPin}
                onChange={(e) => {
                  setCajeroPin(pin(e.target.value));
                  setError(null);
                }}
              />
            </label>
          </div>
        )}

        {error && (
          <p className="mensaje-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="boton activo"
          disabled={enviando}
          onClick={() => void instalar()}
        >
          {enviando ? 'Configurando…' : 'Empezar a vender'}
        </button>
      </div>
    </section>
  );
}
