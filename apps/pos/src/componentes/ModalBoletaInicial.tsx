import { useState } from 'react';
import {
  ErrorApi,
  type ClienteApi,
  type ConfiguracionLocal,
  type ModalidadBoleta,
  type Usuario,
} from '../api.js';

export interface Props {
  api: ClienteApi;
  config: ConfiguracionLocal;
  usuario: Usuario;
  alConfirmar: (config: ConfiguracionLocal) => void;
  alSalir: () => void;
}

/**
 * Pregunta bloqueante del primer arranque de la caja (CLAUDE.md §2). No se puede vender
 * hasta que el dueño elija cómo emitirá las boletas. La opción "Con la app del SII" viene
 * preseleccionada; "Desde esta caja" solo se habilita con certificado y CAF cargados y la
 * certificación ante el SII hecha (credenciales de producción).
 */
export function ModalBoletaInicial({ api, config, usuario, alConfirmar, alSalir }: Props) {
  const [modalidad, setModalidad] = useState<ModalidadBoleta>('PUENTE_MANUAL');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esDueno = usuario.role === 'DUENO';
  const disponibles = config.modalidadesDisponibles ?? ['PUENTE_MANUAL'];
  const puedeSii = disponibles.includes('SII_DIRECTO');
  const faltaCertificar = config.siiListo === true && config.siiAmbiente === 'certificacion';

  const confirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await api.guardarConfiguracion({ dteProvider: modalidad });
      alConfirmar(actualizada);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar la modalidad');
    } finally {
      setGuardando(false);
    }
  };

  if (!esDueno) {
    return (
      <section className="pantalla-centrada">
        <div className="tarjeta">
          <h2>Falta configurar la boleta</h2>
          <p>
            El dueño debe elegir cómo emitirá las boletas antes de la primera venta. Pídele que
            entre con su PIN y complete la configuración.
          </p>
          <button type="button" className="boton" onClick={alSalir}>
            Salir
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pantalla-centrada">
      <div className="tarjeta" role="dialog" aria-modal="true" aria-labelledby="boleta-inicial">
        <h2 id="boleta-inicial">¿Cómo emitirá las boletas?</h2>
        <p className="suave">
          Se pregunta una sola vez, antes de la primera venta. Después puedes cambiarlo en
          Configuración.
        </p>

        <fieldset className="opciones">
          <legend>Modalidad de boleta</legend>
          <label className="opcion">
            <input
              type="radio"
              name="boleta-inicial"
              checked={modalidad === 'PUENTE_MANUAL'}
              onChange={() => {
                setModalidad('PUENTE_MANUAL');
                setError(null);
              }}
            />
            <span>
              <strong>Con la app del SII</strong>
              <span className="suave">
                La caja imprime un comprobante de venta (no válido como boleta) y tú emites la
                boleta en la app e-Boleta del SII por el total exacto.
              </span>
            </span>
          </label>
          <label className={`opcion${puedeSii ? '' : ' opcion-deshabilitada'}`}>
            <input
              type="radio"
              name="boleta-inicial"
              checked={modalidad === 'SII_DIRECTO'}
              disabled={!puedeSii}
              onChange={() => {
                setModalidad('SII_DIRECTO');
                setError(null);
              }}
            />
            <span>
              <strong>Desde esta caja</strong>
              <span className="suave">
                {puedeSii
                  ? 'La caja imprime la boleta y la envía al SII. Requiere el trámite del Formulario N° 2117.'
                  : faltaCertificar
                    ? 'Todavía no está disponible: falta terminar la certificación ante el SII.'
                    : 'Todavía no está disponible: falta cargar el certificado digital y un CAF.'}
              </span>
            </span>
          </label>
          {disponibles.includes('MOCK') && (
            <label className="opcion">
              <input
                type="radio"
                name="boleta-inicial"
                checked={modalidad === 'MOCK'}
                onChange={() => {
                  setModalidad('MOCK');
                  setError(null);
                }}
              />
              <span>
                <strong>Modo prueba (solo desarrollo)</strong>
                <span className="suave">No emite boletas. Sirve para probar la caja.</span>
              </span>
            </label>
          )}
        </fieldset>

        {error && (
          <p className="mensaje-error" role="alert">
            {error}
          </p>
        )}
        <div className="fila-botones">
          <button
            type="button"
            className="boton"
            disabled={guardando}
            onClick={() => void confirmar()}
          >
            {guardando ? 'Guardando…' : 'Confirmar y vender'}
          </button>
          <button type="button" className="boton boton-texto" onClick={alSalir}>
            Salir
          </button>
        </div>
      </div>
    </section>
  );
}
