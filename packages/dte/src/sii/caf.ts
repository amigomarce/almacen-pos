import { ErrorDominio, parsearRut } from '@almacen/core';
import type { Caf } from './tipos.js';

/** Quita espacios en blanco entre etiquetas (los CAF del SII pueden venir indentados). */
function aplanar(xml: string): string {
  return xml.replace(/>\s+</g, '><');
}

/** Contenido del primer elemento `<tag>` (sin atributos). */
function valor(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  const v = m?.[1];
  if (v === undefined) {
    throw new ErrorDominio('CAF_INVALIDO', `Falta <${tag}> en el CAF`);
  }
  return v;
}

function texto(xml: string, tag: string): string {
  return valor(xml, tag).trim();
}

/**
 * Lee el archivo de autorización de folios (`<AUTORIZACION>…</AUTORIZACION>`) que entrega
 * el SII y devuelve el CAF listo para timbrar.
 *
 * El elemento `<CAF>` se conserva compacto para incrustarlo verbatim en el TED. La clave
 * privada se lee de `<RSASK>` (PEM RSA PKCS#1).
 */
export function parsearCaf(xml: string): Caf {
  const cafMatch = /<CAF\b[^>]*>[\s\S]*?<\/CAF>/i.exec(xml);
  if (!cafMatch) throw new ErrorDominio('CAF_INVALIDO', 'No se encontró el elemento <CAF>');
  const xmlCaf = aplanar(cafMatch[0]);

  const da = valor(xmlCaf, 'DA');
  const rut = texto(da, 'RE');
  const razonSocial = texto(da, 'RS');
  const tipoDte = Number(texto(da, 'TD'));
  if (tipoDte !== 39 && tipoDte !== 41) {
    throw new ErrorDominio('CAF_INVALIDO', `Tipo de documento no soportado en el CAF: ${tipoDte}`);
  }

  const rng = valor(da, 'RNG');
  const folioDesde = Number(texto(rng, 'D'));
  const folioHasta = Number(texto(rng, 'H'));
  const fechaAutorizacion = texto(da, 'FA');
  const rsapk = valor(da, 'RSAPK');
  const modulo = texto(rsapk, 'M').replace(/\s+/g, '');
  const exponente = texto(rsapk, 'E').replace(/\s+/g, '');
  const idk = Number(texto(da, 'IDK'));

  if (
    !Number.isInteger(folioDesde) ||
    !Number.isInteger(folioHasta) ||
    folioDesde < 1 ||
    folioHasta < folioDesde
  ) {
    throw new ErrorDominio('CAF_INVALIDO', 'Rango de folios inválido en el CAF');
  }
  if (!parsearRut(rut)) throw new ErrorDominio('CAF_INVALIDO', `RUT inválido en el CAF: ${rut}`);

  const rsask = /<RSASK>\s*([\s\S]*?)\s*<\/RSASK>/i.exec(xml)?.[1];
  if (!rsask) {
    throw new ErrorDominio('CAF_SIN_CLAVE', 'El CAF no trae la clave privada <RSASK>');
  }
  const clavePrivadaPem = rsask
    .split(/\r?\n/)
    .map((l) => l.trim())
    .join('\n')
    .trim();

  return {
    rut,
    razonSocial,
    tipoDte,
    folioDesde,
    folioHasta,
    fechaAutorizacion,
    idk,
    modulo,
    exponente,
    clavePrivadaPem,
    xmlCaf,
  };
}
