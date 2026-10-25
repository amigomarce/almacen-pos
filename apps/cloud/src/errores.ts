import { ErrorDominio } from '@almacen/core';

/** Error de una regla de negocio de la nube con su código HTTP. */
export class ErrorHttp extends ErrorDominio {
  constructor(
    codigo: string,
    mensaje: string,
    readonly estadoHttp: 400 | 403 | 404 | 409,
    readonly datos?: Record<string, unknown>,
  ) {
    super(codigo, mensaje);
  }
}
