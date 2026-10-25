import { useEffect, useRef, type ReactNode } from 'react';

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
  const ref = useRef<HTMLDivElement>(null);
  // El foco entra a la ventana (si ningún campo lo tomó), para que Enter no active un botón de fondo.
  useEffect(() => {
    const ventana = ref.current;
    if (ventana && !ventana.contains(document.activeElement)) ventana.focus();
  }, []);
  return (
    <div className="modal-fondo">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
      >
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
