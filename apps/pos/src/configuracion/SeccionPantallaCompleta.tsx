import { useEffect, useState } from 'react';
import type { PantallaCompleta } from '../kiosco.js';

/**
 * Configuración → Pantalla completa (solo el dueño). Es la **única** forma de salir del modo
 * bloqueado de la caja (ADR-019). En el navegador no se muestra.
 */
export function SeccionPantallaCompleta({
  pantalla,
  cajaAbierta = false,
}: {
  pantalla: PantallaCompleta;
  /** Con un turno sin cerrar no se puede salir (la app tampoco se puede cerrar). */
  cajaAbierta?: boolean;
}) {
  const [activa, setActiva] = useState<boolean | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pantalla.disponible) return;
    let vigente = true;
    pantalla
      .activa()
      .then((a) => {
        if (vigente) setActiva(a);
      })
      .catch(() => {
        if (vigente) setActiva(true);
      });
    return () => {
      vigente = false;
    };
  }, [pantalla]);

  if (!pantalla.disponible) return null;

  const cambiar = async (salir: boolean) => {
    setTrabajando(true);
    setError(null);
    try {
      if (salir) await pantalla.salir();
      else await pantalla.entrar();
      setActiva(!salir);
    } catch (e) {
      // Tauri devuelve el motivo como texto (por ejemplo, la caja abierta).
      setError(typeof e === 'string' ? e : 'No se pudo cambiar la pantalla completa');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="tarjeta" id="pantalla-completa">
      <h2>Pantalla completa</h2>
      {activa === false ? (
        <>
          <p className="suave">
            La caja está en una ventana normal: se puede cambiar a otro programa y, con la caja
            cerrada, cerrar el programa. Al volver a abrirla parte otra vez en pantalla completa.
          </p>
          <div className="fila fila-izquierda">
            <button
              type="button"
              className="boton"
              disabled={trabajando}
              onClick={() => void cambiar(false)}
            >
              Volver a pantalla completa
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="suave">
            La caja funciona en pantalla completa bloqueada: no se cierra con Alt+F4 ni se cambia de
            programa con la tecla Windows o Alt+Tab, y todas las teclas quedan para la caja. Este
            botón es la única forma de salir, y solo con la caja cerrada.
          </p>
          <div className="fila fila-izquierda">
            <button
              type="button"
              className="boton"
              disabled={trabajando || activa === null || cajaAbierta}
              onClick={() => void cambiar(true)}
            >
              Salir de pantalla completa
            </button>
          </div>
          {cajaAbierta && (
            <p className="mensaje-aviso" role="status">
              La caja está abierta: primero haz el cierre de caja.
            </p>
          )}
        </>
      )}
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
