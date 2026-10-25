import { ErrorDominio } from '@almacen/core';

/** Error de una regla de negocio con su código HTTP y datos extra para la caja. */
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
