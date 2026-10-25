import type { ReactNode } from 'react';

/** Ventana sobre la pantalla. Se cierra con Esc (lo maneja quien la abre) o con el botón. */
export function Modal({
  titulo,
  alCerrar,
  children,
}: {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-fondo">
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-encabezado">
          <h2>{titulo}</h2>
          <button type="button" className="boton boton-chico" onClick={alCerrar}>
            Cerrar (Esc)
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
