/**
 * El token de sesión se guarda en sessionStorage para sobrevivir a una recarga de la página
 * (no a cerrar la ventana). Si el navegador lo bloquea, la caja funciona igual: pide el PIN.
 */
const CLAVE = 'almacen-pos.token';

export function leerToken(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(CLAVE, token);
    else sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento: solo se pierde la sesión al recargar.
  }
}
