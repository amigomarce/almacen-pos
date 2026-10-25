/** Error del dominio con un código estable para que la UI muestre un mensaje en español. */
export class ErrorDominio extends Error {
  readonly codigo: string;

  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
  }
}
