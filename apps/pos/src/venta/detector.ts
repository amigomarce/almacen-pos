/**
 * El lector de barras USB "tipea" como un teclado, pero muchísimo más rápido que una persona
 * (< 50 ms entre teclas) y termina con Enter. Esto permite reconocer un escaneo aunque el foco
 * esté en otro campo (por ejemplo, la búsqueda F2). docs/ARQUITECTURA.md §4.
 */
export class DetectorEscaneo {
  private buffer = '';
  private ultima = -Infinity;

  constructor(
    private readonly intervaloMaxMs = 50,
    private readonly largoMin = 6,
  ) {}

  /** Registra una tecla. Devuelve el código si con este Enter se completó un escaneo. */
  tecla(key: string, ahoraMs: number): string | null {
    const rapida = ahoraMs - this.ultima <= this.intervaloMaxMs;
    this.ultima = ahoraMs;
    if (key === 'Enter') {
      const codigo = rapida && this.buffer.length >= this.largoMin ? this.buffer : null;
      this.buffer = '';
      return codigo;
    }
    if (key.length !== 1) {
      this.buffer = '';
      return null;
    }
    this.buffer = rapida ? this.buffer + key : key;
    return null;
  }
}
