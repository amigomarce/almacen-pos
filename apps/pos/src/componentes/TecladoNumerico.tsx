interface Props {
  alDigito: (d: string) => void;
  alBorrar: () => void;
  alAceptar: () => void;
  etiquetaAceptar: string;
  deshabilitado?: boolean;
  aceptarDeshabilitado?: boolean;
}

const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Teclado numérico grande para pantalla táctil o mouse. */
export function TecladoNumerico(p: Props) {
  return (
    <div className="teclado" role="group" aria-label="Teclado numérico">
      {DIGITOS.map((d) => (
        <button
          key={d}
          type="button"
          className="tecla"
          disabled={p.deshabilitado}
          onClick={() => {
            p.alDigito(d);
          }}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        className="tecla tecla-secundaria"
        disabled={p.deshabilitado}
        onClick={p.alBorrar}
      >
        Borrar
      </button>
      <button
        type="button"
        className="tecla"
        disabled={p.deshabilitado}
        onClick={() => {
          p.alDigito('0');
        }}
      >
        0
      </button>
      <button
        type="button"
        className="tecla tecla-primaria"
        disabled={p.deshabilitado || p.aceptarDeshabilitado}
        onClick={p.alAceptar}
      >
        {p.etiquetaAceptar}
      </button>
    </div>
  );
}
