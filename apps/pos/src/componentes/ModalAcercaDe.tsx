import { Fragment, useEffect, useState } from 'react';
import { ErrorApi, type AcercaDe, type ClienteApi } from '../api.js';
import { Modal } from './Modal.js';

/** Convierte las URL del texto en enlaces, sin cambiar el texto (ADR-004: se muestra tal cual). */
function ConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Versión y atribución de los datos de productos (ODbL, ADR-004). Sale de `GET /about`. */
export function ModalAcercaDe({ api, alCerrar }: { api: ClienteApi; alCerrar: () => void }) {
  const [datos, setDatos] = useState<AcercaDe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .acercaDe()
      .then(setDatos)
      .catch((e: unknown) => {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la información');
      });
  }, [api]);

  return (
    <Modal titulo="Acerca de" alCerrar={alCerrar}>
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      {datos && (
        <div className="acerca-de">
          <p>
            <strong>{datos.app}</strong> · versión {datos.version}
          </p>
          <h3>Datos de productos</h3>
          <p className="atribucion">
            <ConEnlaces texto={datos.attribution} />
          </p>
          <p>
            Licencia:{' '}
            <a href={datos.license_url} target="_blank" rel="noreferrer">
              {datos.license}
            </a>
          </p>
          {datos.sources.length > 0 && (
            <ul aria-label="Fuentes">
              {datos.sources.map((f, i) => (
                <li key={f.id ?? i}>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.nombre ?? f.url}
                    </a>
                  ) : (
                    f.nombre
                  )}
                  {f.export_del ? ` · exportación del ${f.export_del}` : ''}
                </li>
              ))}
            </ul>
          )}
          {(datos.product_count !== null || datos.built_at) && (
            <p className="suave">
              {datos.product_count !== null
                ? `${datos.product_count.toLocaleString('es-CL')} productos en la base`
                : ''}
              {datos.built_at ? ` · generada el ${datos.built_at.slice(0, 10)}` : ''}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
