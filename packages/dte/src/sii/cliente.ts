import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { ErrorDominio, parsearRut } from '@almacen/core';
import type { TipoDte } from '../tipos.js';
import { firmarEnvolvente } from './firma.js';
import { codificarEnvioLatin1 } from './envio.js';
import { escaparTexto } from './xml.js';
import type { CertificadoFirma } from './tipos.js';

type Fetch = typeof fetch;

/** Ambientes del SII. En desarrollo solo se usa `certificacion` (CLAUDE.md §2). */
export type AmbienteSii = 'certificacion' | 'produccion';

const SERVIDORES: Record<AmbienteSii, { api: string; envio: string }> = {
  certificacion: {
    api: 'https://apicert.sii.cl/recursos/v1',
    envio: 'https://pangal.sii.cl/recursos/v1',
  },
  produccion: {
    api: 'https://api.sii.cl/recursos/v1',
    envio: 'https://rahue.sii.cl/recursos/v1',
  },
};

/** El token del SII dura 1 h y se renueva con cada uso; se renueva con margen a los 55 min. */
const DURACION_TOKEN_MS = 55 * 60 * 1000;

const USER_AGENT_POR_DEFECTO = 'AlmacenDeBarrio-POS/0.1';

export type EstadoEnvioSii =
  | 'REC'
  | 'EPR'
  | 'CRT'
  | 'FOK'
  | 'PRD'
  | 'RCH'
  | 'RCO'
  | 'VOF'
  | 'RFR'
  | 'RPR'
  | 'RPT'
  | 'RSC'
  | 'SOK'
  | 'RCT';

const ESTADOS_ENVIO = new Set<string>([
  'REC',
  'EPR',
  'CRT',
  'FOK',
  'PRD',
  'RCH',
  'RCO',
  'VOF',
  'RFR',
  'RPR',
  'RPT',
  'RSC',
  'SOK',
  'RCT',
]);

export type EstadoDocumentoSii = 'DOK' | 'RPR' | 'RCH' | 'RLV';

const ESTADOS_DOCUMENTO = new Set<string>(['DOK', 'RPR', 'RCH', 'RLV']);

export interface ErrorEnvioSii {
  seccion: string;
  linea: number;
  nivel: number;
  codigo: number;
  descripcion: string;
  detalle: string;
}

export interface DetalleEnvioSii {
  tipo: TipoDte | null;
  folio: number | null;
  estado: EstadoDocumentoSii;
  descripcion: string;
  errores: readonly ErrorEnvioSii[];
}

export interface EstadisticaEnvioSii {
  tipo: TipoDte;
  informados: number;
  aceptados: number;
  rechazados: number;
  reparos: number;
}

/** Respuesta del POST de envío. */
export interface ResultadoEnvioSii {
  rutEmisor: string;
  rutEnvia: string;
  trackId: number;
  fechaRecepcion: string;
  estado: EstadoEnvioSii;
  archivo: string;
}

/** Respuesta del GET de estado del envío. */
export interface EstadoEnvioDetalladoSii {
  rutEmisor: string;
  rutEnvia: string;
  trackId: number;
  fechaRecepcion: string;
  estado: EstadoEnvioSii;
  estadistica: readonly EstadisticaEnvioSii[];
  detalle: readonly DetalleEnvioSii[];
}

export interface OpcionesClienteSii {
  ambiente: AmbienteSii;
  /** RUT del emisor de las boletas (con guion y DV). */
  rutEmisor: string;
  /** RUT de la persona que envía (con guion y DV). */
  rutEnvia: string;
  certificado: CertificadoFirma;
  /** `fetch` inyectable para tests. */
  fetchFn?: Fetch;
  /** `User-Agent` obligatorio en el POST de envío. */
  userAgent?: string;
  /** Solo para tests o proxies: sobreescriben los hosts del ambiente. */
  baseApi?: string;
  baseEnvio?: string;
  /** Reloj inyectable (ms). */
  ahora?: () => number;
}

export interface ArchivoEnvioSii {
  nombre: string;
  contenido: string;
  tipo?: string;
}

export interface CamposEnvioSii {
  rutSender: string;
  dvSender: string;
  rutCompany: string;
  dvCompany: string;
  archivo: ArchivoEnvioSii;
}

/**
 * Cliente de la API de boletas electrónicas del SII (OpenAPI v1.0.5).
 *
 * Flujo: `obtenerSemilla` → `obtenerToken` (getToken firmado) → `enviarBoletas`
 * (multipart) → `consultarEstado`. El token se cachea y se reutiliza mientras dure;
 * si el SII responde 401/403 se renueva y se reintenta una vez.
 *
 * Los hosts se eligen por ambiente; el envío usa `pangal`/`rahue` y el resto
 * `apicert`/`api`. Ver ADR-009.
 */
export class ClienteSii {
  private readonly api: string;
  private readonly envio: string;
  private readonly fetchFn: Fetch;
  private readonly ahora: () => number;
  private readonly rutEmisor: string;
  private readonly rutEnvia: string;
  private readonly emisor: { numero: string; dv: string };
  private readonly envia: { numero: string; dv: string };
  private readonly certificado: CertificadoFirma;
  private readonly userAgent: string;
  private token: { valor: string; expira: number } | null = null;

  constructor(opciones: OpcionesClienteSii) {
    const servidores = SERVIDORES[opciones.ambiente];
    this.api = opciones.baseApi ?? servidores.api;
    this.envio = opciones.baseEnvio ?? servidores.envio;
    this.fetchFn = opciones.fetchFn ?? ((...args) => fetch(...args));
    this.ahora = opciones.ahora ?? (() => Date.now());
    const emisor = parsearRut(opciones.rutEmisor);
    if (!emisor) throw new ErrorDominio('RUT_INVALIDO', `RUT inválido: ${opciones.rutEmisor}`);
    const envia = parsearRut(opciones.rutEnvia);
    if (!envia) throw new ErrorDominio('RUT_INVALIDO', `RUT inválido: ${opciones.rutEnvia}`);
    this.emisor = { numero: String(emisor.cuerpo), dv: emisor.dv };
    this.envia = { numero: String(envia.cuerpo), dv: envia.dv };
    this.rutEmisor = `${emisor.cuerpo}-${emisor.dv}`;
    this.rutEnvia = `${envia.cuerpo}-${envia.dv}`;
    this.certificado = opciones.certificado;
    this.userAgent = opciones.userAgent ?? USER_AGENT_POR_DEFECTO;
  }

  /** Pide una semilla nueva (dura 2 minutos). */
  async obtenerSemilla(): Promise<string> {
    const res = await this.pedir(`${this.api}/boleta.electronica.semilla`, {
      method: 'GET',
      headers: { accept: 'application/xml' },
    });
    const texto = await res.text();
    if (!res.ok) throw errorHttp('pedir la semilla', res.status, texto);
    const respuesta = parsearRespuestaSii(texto);
    if (respuesta.estado !== 0 || !respuesta.semilla) {
      throw new ErrorDominio(
        'SII_SEMILLA_RECHAZADA',
        respuesta.glosa ?? 'El SII no entregó la semilla',
      );
    }
    return respuesta.semilla;
  }

  /** Firma el `getToken` con la semilla y obtiene el token de autenticación. */
  async obtenerToken(semilla: string): Promise<string> {
    const cuerpo = generarGetTokenFirmado(semilla, this.certificado);
    const res = await this.pedir(`${this.api}/boleta.electronica.token`, {
      method: 'POST',
      headers: { 'content-type': 'application/xml', accept: 'application/xml' },
      body: cuerpo,
    });
    const texto = await res.text();
    if (!res.ok) throw errorHttp('pedir el token', res.status, texto);
    const respuesta = parsearRespuestaSii(texto);
    if (respuesta.estado !== 0 || !respuesta.token) {
      throw new ErrorDominio(
        'SII_TOKEN_RECHAZADO',
        respuesta.glosa ?? 'El SII no entregó el token',
      );
    }
    return respuesta.token;
  }

  /** Envía un `EnvioBOLETA` firmado y devuelve el track id del SII. */
  async enviarBoletas(xml: string, nombreArchivo: string): Promise<ResultadoEnvioSii> {
    return this.conToken((token) => this.enviarConToken(token, xml, nombreArchivo));
  }

  /** Consulta el estado de un envío por su track id. */
  async consultarEstado(trackId: number | string): Promise<EstadoEnvioDetalladoSii> {
    const track = String(trackId);
    if (!/^\d{1,15}$/.test(track)) {
      throw new ErrorDominio('TRACKID_INVALIDO', `Track id inválido: "${track}"`);
    }
    return this.conToken((token) => this.consultarEstadoConToken(token, track));
  }

  private async tokenValido(): Promise<string> {
    const actual = this.token;
    if (actual && actual.expira > this.ahora()) return actual.valor;
    const semilla = await this.obtenerSemilla();
    const token = await this.obtenerToken(semilla);
    this.token = { valor: token, expira: this.ahora() + DURACION_TOKEN_MS };
    return token;
  }

  private async conToken<T>(accion: (token: string) => Promise<T>): Promise<T> {
    const token = await this.tokenValido();
    try {
      return await accion(token);
    } catch (error) {
      if (error instanceof ErrorDominio && error.codigo === 'SII_NO_AUTORIZADO') {
        this.token = null;
        return accion(await this.tokenValido());
      }
      throw error;
    }
  }

  private async enviarConToken(
    token: string,
    xml: string,
    nombreArchivo: string,
  ): Promise<ResultadoEnvioSii> {
    const emisor = this.emisor;
    const envia = this.envia;
    const boundary = `----AlmacenPOS${randomUUID()}`;
    const cuerpo = construirMultipart(
      {
        rutSender: envia.numero,
        dvSender: envia.dv,
        rutCompany: emisor.numero,
        dvCompany: emisor.dv,
        archivo: { nombre: nombreArchivo, contenido: xml },
      },
      boundary,
    );

    const res = await this.pedir(`${this.envio}/boleta.electronica.envio`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: `TOKEN=${token}`,
        'user-agent': this.userAgent,
        accept: 'application/json',
      },
      body: cuerpo,
    });
    const texto = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new ErrorDominio(
        'SII_NO_AUTORIZADO',
        'El SII rechazó el token; se reintenta con uno nuevo',
      );
    }
    if (res.status === 405) {
      throw new ErrorDominio(
        'SII_LIMITE',
        'El SII limitó la cantidad de envíos; reintenta más tarde',
      );
    }
    if (!res.ok) throw errorHttp('enviar las boletas', res.status, texto);
    return normalizarResultadoEnvio(parsearJson(texto, 'envío'), {
      rutEmisor: this.rutEmisor,
      rutEnvia: this.rutEnvia,
    });
  }

  private async consultarEstadoConToken(
    token: string,
    trackId: string,
  ): Promise<EstadoEnvioDetalladoSii> {
    const emisor = this.emisor;
    const res = await this.pedir(
      `${this.api}/boleta.electronica.envio/${emisor.numero}-${emisor.dv}-${trackId}`,
      {
        method: 'GET',
        headers: {
          cookie: `TOKEN=${token}`,
          'user-agent': this.userAgent,
          accept: 'application/json',
        },
      },
    );
    const texto = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new ErrorDominio(
        'SII_NO_AUTORIZADO',
        'El SII rechazó el token; se reintenta con uno nuevo',
      );
    }
    if (res.status === 405) {
      throw new ErrorDominio(
        'SII_LIMITE',
        'El SII limitó la cantidad de consultas; reintenta más tarde',
      );
    }
    if (!res.ok) throw errorHttp('consultar el estado', res.status, texto);
    return normalizarEstadoEnvio(parsearJson(texto, 'estado'), {
      rutEmisor: this.rutEmisor,
      rutEnvia: this.rutEnvia,
    });
  }

  private async pedir(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch {
      throw new ErrorDominio('SII_SIN_CONEXION', 'No se pudo conectar con el SII');
    }
  }
}

/**
 * Genera el cuerpo XML del `getToken` firmado, con exactamente dos líneas y sin salto
 * final, como exige el SII: la declaración y el documento con la firma incrustada.
 */
export function generarGetTokenFirmado(semilla: string, certificado: CertificadoFirma): string {
  if (semilla.trim() === '') {
    throw new ErrorDominio('SEMILLA_VACIA', 'La semilla del SII no puede estar vacía');
  }
  const sinFirma = `<getToken><item><Semilla>${escaparTexto(semilla)}</Semilla></item></getToken>`;
  const firma = firmarEnvolvente(sinFirma, certificado);
  const conFirma = `${sinFirma.slice(0, -'</getToken>'.length)}${firma}</getToken>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${conFirma}`;
}

/** Construye el cuerpo `multipart/form-data` del envío (sin dependencias). */
export function construirMultipart(campos: CamposEnvioSii, boundary: string): Buffer {
  if (!/^[A-Za-z0-9._-]+$/.test(boundary)) {
    throw new ErrorDominio('BOUNDARY_INVALIDO', `Boundary multipart inválido: "${boundary}"`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(campos.archivo.nombre)) {
    throw new ErrorDominio(
      'NOMBRE_ARCHIVO_INVALIDO',
      `Nombre de archivo inválido: "${campos.archivo.nombre}"`,
    );
  }

  const partes: Buffer[] = [];
  const campo = (nombre: string, valor: string): void => {
    partes.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${nombre}"\r\n\r\n${valor}\r\n`,
        'utf8',
      ),
    );
  };
  campo('rutSender', campos.rutSender);
  campo('dvSender', campos.dvSender);
  campo('rutCompany', campos.rutCompany);
  campo('dvCompany', campos.dvCompany);
  partes.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${campos.archivo.nombre}"\r\n` +
        `Content-Type: ${campos.archivo.tipo ?? 'application/xml'}\r\n\r\n`,
      'utf8',
    ),
  );
  partes.push(codificarEnvioLatin1(campos.archivo.contenido));
  partes.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(partes);
}

export interface RespuestaSii {
  estado: number;
  glosa: string | null;
  semilla: string | null;
  token: string | null;
}

/** Parsea la respuesta XML del SII (con o sin prefijo `SII:`). */
export function parsearRespuestaSii(xml: string): RespuestaSii {
  const estadoTexto = extraerEtiqueta(xml, 'ESTADO');
  if (estadoTexto === null) {
    throw new ErrorDominio('SII_RESPUESTA_INVALIDA', 'La respuesta del SII no trae ESTADO');
  }
  const estado = Number(estadoTexto);
  if (!Number.isFinite(estado)) {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `La respuesta del SII trae un ESTADO inválido: "${estadoTexto}"`,
    );
  }
  return {
    estado,
    glosa: desescapar(extraerEtiqueta(xml, 'GLOSA') ?? '') || null,
    semilla: extraerEtiqueta(xml, 'SEMILLA'),
    token: extraerEtiqueta(xml, 'TOKEN'),
  };
}

function extraerEtiqueta(xml: string, etiqueta: string): string | null {
  const re = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${etiqueta}>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${etiqueta}>`,
  );
  const m = re.exec(xml);
  const valor = m?.[1]?.trim();
  return valor === undefined || valor === '' ? null : valor;
}

function desescapar(texto: string): string {
  return texto
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function parsearJson(texto: string, contexto: string): unknown {
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `El SII no devolvió JSON válido en el ${contexto}`,
    );
  }
}

function objeto(valor: unknown, campo: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `La respuesta del SII no trae el objeto "${campo}"`,
    );
  }
  return valor as Record<string, unknown>;
}

function textoOpcional(valor: unknown, porDefecto: string): string {
  return typeof valor === 'string' ? valor : porDefecto;
}

function numero(valor: unknown, campo: string): number {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `La respuesta del SII no trae el número "${campo}"`,
    );
  }
  return n;
}

function numeroOpcional(valor: unknown, porDefecto: number): number {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : porDefecto;
}

function estadoEnvio(valor: unknown): EstadoEnvioSii {
  if (typeof valor !== 'string' || !ESTADOS_ENVIO.has(valor)) {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `La respuesta del SII trae un estado de envío desconocido: "${String(valor)}"`,
    );
  }
  return valor as EstadoEnvioSii;
}

function estadoDocumento(valor: unknown): EstadoDocumentoSii {
  if (typeof valor !== 'string' || !ESTADOS_DOCUMENTO.has(valor)) {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `La respuesta del SII trae un estado de documento desconocido: "${String(valor)}"`,
    );
  }
  return valor as EstadoDocumentoSii;
}

function tipoDteOpcional(valor: unknown): TipoDte | null {
  return valor === 39 || valor === 41 ? valor : null;
}

function normalizarResultadoEnvio(
  datos: unknown,
  porDefecto: { rutEmisor: string; rutEnvia: string },
): ResultadoEnvioSii {
  const d = objeto(datos, 'envío');
  return {
    rutEmisor: textoOpcional(d['rut_emisor'], porDefecto.rutEmisor),
    rutEnvia: textoOpcional(d['rut_envia'], porDefecto.rutEnvia),
    trackId: numero(d['trackid'], 'trackid'),
    fechaRecepcion: textoOpcional(d['fecha_recepcion'], ''),
    estado: estadoEnvio(d['estado']),
    archivo: textoOpcional(d['file'], ''),
  };
}

function normalizarEstadoEnvio(
  datos: unknown,
  porDefecto: { rutEmisor: string; rutEnvia: string },
): EstadoEnvioDetalladoSii {
  const d = objeto(datos, 'estado');
  const base = normalizarResultadoEnvio(d, porDefecto);
  const estadistica = Array.isArray(d['estadistica'])
    ? d['estadistica'].map(normalizarEstadistica)
    : [];
  const detalle = Array.isArray(d['detalle_rep_rech'])
    ? d['detalle_rep_rech'].map(normalizarDetalle)
    : [];
  return {
    rutEmisor: base.rutEmisor,
    rutEnvia: base.rutEnvia,
    trackId: base.trackId,
    fechaRecepcion: base.fechaRecepcion,
    estado: base.estado,
    estadistica,
    detalle,
  };
}

function normalizarEstadistica(valor: unknown): EstadisticaEnvioSii {
  const d = objeto(valor, 'estadistica');
  const tipo = numero(d['tipo'], 'tipo');
  if (tipo !== 39 && tipo !== 41) {
    throw new ErrorDominio(
      'SII_RESPUESTA_INVALIDA',
      `La estadística del SII trae un tipo de DTE desconocido: ${tipo}`,
    );
  }
  return {
    tipo,
    informados: numeroOpcional(d['informados'], 0),
    aceptados: numeroOpcional(d['aceptados'], 0),
    rechazados: numeroOpcional(d['rechazados'], 0),
    reparos: numeroOpcional(d['reparos'], 0),
  };
}

function normalizarDetalle(valor: unknown): DetalleEnvioSii {
  const d = objeto(valor, 'detalle_rep_rech');
  return {
    tipo: tipoDteOpcional(d['tipo']),
    folio: typeof d['folio'] === 'number' ? d['folio'] : null,
    estado: estadoDocumento(d['estado']),
    descripcion: textoOpcional(d['descripcion'], ''),
    errores: Array.isArray(d['error']) ? d['error'].map(normalizarError) : [],
  };
}

function normalizarError(valor: unknown): ErrorEnvioSii {
  const d = objeto(valor, 'error');
  return {
    seccion: textoOpcional(d['seccion'], ''),
    linea: numeroOpcional(d['linea'], 0),
    nivel: numeroOpcional(d['nivel'], 0),
    codigo: numeroOpcional(d['codigo'], 0),
    descripcion: textoOpcional(d['descripcion'], ''),
    detalle: textoOpcional(d['detalle'], ''),
  };
}

function errorHttp(operacion: string, status: number, cuerpo: string): ErrorDominio {
  const detalle = cuerpo.replace(/\s+/g, ' ').trim().slice(0, 200);
  return new ErrorDominio(
    'SII_HTTP',
    `El SII respondió ${status} al ${operacion}${detalle === '' ? '' : `: ${detalle}`}`,
  );
}
