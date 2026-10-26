/** Franja fija con SII_DIRECTO en ambiente de certificación: las boletas no valen (CLAUDE.md §2). */
export function AvisoCertificacion() {
  return (
    <div className="aviso-modo-prueba" role="note" aria-label="Ambiente de certificación">
      AMBIENTE DE CERTIFICACIÓN SII – las boletas no tienen validez
    </div>
  );
}
