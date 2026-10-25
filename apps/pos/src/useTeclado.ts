import { useEffect, useRef } from 'react';

/** Escucha el teclado físico en toda la ventana mientras el componente está montado. */
export function useTeclado(alPresionar: (e: KeyboardEvent) => void, activo = true): void {
  const ref = useRef(alPresionar);
  useEffect(() => {
    ref.current = alPresionar;
  });
  useEffect(() => {
    if (!activo) return;
    const oyente = (e: KeyboardEvent) => {
      ref.current(e);
    };
    window.addEventListener('keydown', oyente);
    return () => {
      window.removeEventListener('keydown', oyente);
    };
  }, [activo]);
}
