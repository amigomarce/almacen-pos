interface Props {
  alDigito: (d: string) => void;
  alBorrar: () => void;
  alAceptar: () => void;
  etiquetaAceptar: string;
  deshabilitado?: boolean;
  aceptarDeshabilitado?: boolean;
  /** Agrega la tecla "," (cantidades en kg). */
  conComa?: boolean;
}

const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Teclado numérico grande para pantalla táctil o mouse. */
export function TecladoNumerico(p: Props) {
  const tecla = (texto: string, alPresionar: () => void, clase = 'tecla') => (
    <button
      key={texto}
      type="button"
      className={clase}
      disabled={p.deshabilitado}
      onClick={alPresionar}
    >
      {texto}
    </button>
  );
  const digito = (d: string) =>
    tecla(d, () => {
      p.alDigito(d);
    });
  const borrar = tecla('Borrar', p.alBorrar, 'tecla tecla-secundaria');

  return (
    <div className="teclado" role="group" aria-label="Teclado numérico">
      {DIGITOS.map(digito)}
      {p.conComa ? [digito(','), digito('0'), borrar] : [borrar, digito('0')]}
      <button
        type="button"
        className={p.conComa ? 'tecla tecla-primaria tecla-ancha' : 'tecla tecla-primaria'}
        disabled={p.deshabilitado || p.aceptarDeshabilitado}
        onClick={p.alAceptar}
      >
        {p.etiquetaAceptar}
      </button>
    </div>
  );
}
