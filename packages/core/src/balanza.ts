import { calcularDigitoGtin } from './codigo-barras.js';

/**
 * Qué trae embebido un código de balanza:
 * - PESO: gramos (equivale a `qty_milli` de un producto por kg, ver ADR-002).
 * - PRECIO: pesos CLP del total de la etiqueta.
 */
export type ValorBalanza = 'PESO' | 'PRECIO';

/**
 * Formato de etiqueta: `PP` prefijo + código de producto + valor + dígito verificador = 13.
 * Cada marca de balanza (Digi, Systel, Moretti…) se configura distinto; el dueño ajusta
 * esto en la configuración de la caja (Fase 3).
 */
export interface ConfigBalanza {
  /** Prefijos de 2 dígitos ("20"–"29") y qué valor traen. Los no listados se rechazan. */
  prefijos: Readonly<Partial<Record<string, ValorBalanza>>>;
  /** Dígitos del código de producto (el resto, hasta 10, es el valor). */
  digitosCodigo: number;
}

/** Formato más común: PP + CCCCC + VVVVV + D, todos los prefijos con peso en gramos. */
export const CONFIG_BALANZA_POR_DEFECTO: ConfigBalanza = {
  prefijos: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2${i}`, 'PESO'])),
  digitosCodigo: 5,
};

export type ResultadoBalanza =
  | {
      ok: true;
      prefijo: string;
      codigoProducto: string;
      tipo: 'PESO';
      pesoGramos: number;
    }
  | {
      ok: true;
      prefijo: string;
      codigoProducto: string;
      tipo: 'PRECIO';
      precioClp: number;
    }
  | {
      ok: false;
      error: 'FORMATO' | 'DIGITO_VERIFICADOR' | 'PREFIJO_NO_CONFIGURADO' | 'VALOR_CERO' | 'CONFIG';
    };

export function decodificarCodigoBalanza(
  texto: string,
  config: ConfigBalanza = CONFIG_BALANZA_POR_DEFECTO,
): ResultadoBalanza {
  const { digitosCodigo } = config;
  if (!Number.isInteger(digitosCodigo) || digitosCodigo < 1 || digitosCodigo > 9) {
    return { ok: false, error: 'CONFIG' };
  }
  const codigo = texto.trim();
  if (!/^2\d{12}$/.test(codigo)) return { ok: false, error: 'FORMATO' };
  if (calcularDigitoGtin(codigo.slice(0, 12)) !== Number(codigo[12])) {
    return { ok: false, error: 'DIGITO_VERIFICADOR' };
  }
  const prefijo = codigo.slice(0, 2);
  const tipo = config.prefijos[prefijo];
  if (!tipo) return { ok: false, error: 'PREFIJO_NO_CONFIGURADO' };

  const codigoProducto = codigo.slice(2, 2 + digitosCodigo);
  const valor = Number(codigo.slice(2 + digitosCodigo, 12));
  if (valor === 0) return { ok: false, error: 'VALOR_CERO' };

  return tipo === 'PESO'
    ? { ok: true, prefijo, codigoProducto, tipo, pesoGramos: valor }
    : { ok: true, prefijo, codigoProducto, tipo, precioClp: valor };
}
