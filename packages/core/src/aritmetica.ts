import { ErrorDominio } from './errores.js';

export function asegurarEntero(valor: number, nombre: string): void {
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorDominio('NO_ENTERO', `${nombre} debe ser un entero seguro (recibido: ${valor})`);
  }
}

/**
 * División entera con redondeo "half-up" (la mitad se aleja del cero), sin floats.
 * Ej.: 5/2 → 3, 7/3 → 2, -5/2 → -3.
 */
export function dividirRedondeado(dividendo: number, divisor: number): number {
  asegurarEntero(dividendo, 'dividendo');
  asegurarEntero(divisor, 'divisor');
  if (divisor === 0) throw new ErrorDominio('DIVISION_POR_CERO', 'División por cero');

  const signo = Math.sign(dividendo) * Math.sign(divisor);
  const n = Math.abs(dividendo);
  const d = Math.abs(divisor);
  const cociente = Math.floor(n / d);
  const resto = n - cociente * d;
  const resultado = resto * 2 >= d ? cociente + 1 : cociente;
  return signo < 0 ? -resultado : resultado;
}

/** Multiplica enteros verificando que el resultado siga siendo exacto. */
export function multiplicarSeguro(a: number, b: number): number {
  asegurarEntero(a, 'a');
  asegurarEntero(b, 'b');
  const producto = a * b;
  if (!Number.isSafeInteger(producto)) {
    throw new ErrorDominio('DESBORDE', `El producto ${a} × ${b} excede el rango seguro`);
  }
  return producto;
}
