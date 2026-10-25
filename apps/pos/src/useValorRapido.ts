import { useCallback, useRef, useState } from 'react';

/**
 * Estado de texto que se lee al instante (ref) y además se muestra (state). Con teclas muy
 * rápidas (o un lector de barras), un Enter puede llegar antes de que React vuelva a dibujar;
 * leer desde el ref evita perder el último dígito.
 */
export function useValorRapido(inicial = '') {
  const ref = useRef(inicial);
  const [valor, setValor] = useState(inicial);
  const cambiar = useCallback((f: (v: string) => string) => {
    ref.current = f(ref.current);
    setValor(ref.current);
  }, []);
  const leer = useCallback(() => ref.current, []);
  return { valor, cambiar, leer };
}
