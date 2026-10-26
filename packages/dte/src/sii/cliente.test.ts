import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ClienteSii,
  construirMultipart,
  generarGetTokenFirmado,
  parsearRespuestaSii,
  type OpcionesClienteSii,
} from './cliente.js';
import { CERTIFICADO_PEM, CLAVE_PRIVADA_PEM, signedInfoEnvolvente } from './test/ayudas.js';

const CERTIFICADO = { certificadoPem: CERTIFICADO_PEM, clavePrivadaPem: CLAVE_PRIVADA_PEM };

const RUT = '76.086.428-5';

const SEMILLA_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">' +
  '<SII:RESP_HDR><SII:ESTADO>00</SII:ESTADO><SII:GLOSA>Semilla Generada</SII:GLOSA></SII:RESP_HDR>' +
  '<SII:RESP_BODY><SII:SEMILLA>030530912644</SII:SEMILLA></SII:RESP_BODY>' +
  '</SII:RESPUESTA>';

const TOKEN_XML =
  '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">' +
  '<SII:RESP_HDR><SII:ESTADO>0</SII:ESTADO><SII:GLOSA>Token Creado</SII:GLOSA></SII:RESP_HDR>' +
  '<SII:RESP_BODY><SII:TOKEN>XAuSbYXiNh9Ik</SII:TOKEN></SII:RESP_BODY>' +
  '</SII:RESPUESTA>';

const ENVIO_JSON = JSON.stringify({
  rut_emisor: RUT,
  rut_envia: RUT,
  trackid: 1014,
  fecha_recepcion: '2026-10-25 18:37:31',
  estado: 'REC',
  file: 'boleta-2026-10-25-10.xml',
});

const ESTADO_JSON = JSON.stringify({
  rut_emisor: RUT,
  rut_envia: RUT,
  trackid: 1014,
  fecha_recepcion: '30/07/2026 07:57:42',
  estado: 'EPR',
  estadistica: [
    { tipo: 39, informados: 3, aceptados: 2, rechazados: 1, reparos: 0 },
    { tipo: 41, informados: 1, aceptados: 0, rechazados: 0, reparos: 1 },
  ],
  detalle_rep_rech: [
    {
      tipo: 39,
      folio: 1202,
      estado: 'RCH',
      descripcion: 'Dte Rechazado',
      error: [
        {
          seccion: 'CRT',
          linea: 155,
          nivel: 3,
          codigo: 11,
          descripcion: 'RUT envia diferente al Upload',
          detalle: '[155]LSX-00291 value 0.52 is not declared',
        },
      ],
    },
    {
      tipo: null,
      folio: null,
      estado: 'RPR',
      descripcion: 'Dte Aceptado con reparos',
      error: [],
    },
  ],
});

interface Llamada {
  url: string;
  init: RequestInit;
}

type Manejador = (llamada: Llamada) => Response | Promise<Response>;

function clienteCon(
  manejador: Manejador,
  extras: Partial<OpcionesClienteSii> = {},
): { cliente: ClienteSii; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const fetchFn = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const llamada: Llamada = { url, init: init ?? {} };
    llamadas.push(llamada);
    return manejador(llamada);
  }) as typeof fetch;
  const cliente = new ClienteSii({
    ambiente: 'certificacion',
    rutEmisor: RUT,
    rutEnvia: RUT,
    certificado: CERTIFICADO,
    fetchFn,
    ...extras,
  });
  return { cliente, llamadas };
}

function manejadorEstandar(llamada: Llamada): Response {
  if (llamada.url.endsWith('/boleta.electronica.semilla')) return new Response(SEMILLA_XML);
  if (llamada.url.endsWith('/boleta.electronica.token')) return new Response(TOKEN_XML);
  if (llamada.url.endsWith('/boleta.electronica.envio')) return new Response(ENVIO_JSON);
  if (llamada.url.includes('/boleta.electronica.envio/')) return new Response(ESTADO_JSON);
  throw new Error(`URL inesperada: ${llamada.url}`);
}

function sha1Base64(texto: string): string {
  return createHash('sha1').update(Buffer.from(texto, 'utf8')).digest('base64');
}

function cuerpoLatin1(init: RequestInit): string {
  if (!(init.body instanceof Uint8Array)) throw new Error('El cuerpo no es binario');
  return Buffer.from(init.body).toString('latin1');
}

describe('generarGetTokenFirmado', () => {
  it('genera dos líneas, sin salto final, con firma envolvente', () => {
    const xml = generarGetTokenFirmado('030530912644', CERTIFICADO);

    expect(xml.split('\n')).toHaveLength(2);
    expect(xml.endsWith('\n')).toBe(false);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain(
      '<getToken><item><Semilla>030530912644</Semilla></item><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
    );
    expect(xml.endsWith('</Signature></getToken>')).toBe(true);
    expect(xml).toContain('<Reference URI=""><Transforms><Transform Algorithm=');
    expect(xml).toContain('http://www.w3.org/2000/09/xmldsig#enveloped-signature');
  });

  it('firma el documento sin la firma (digest y RSA-SHA1)', () => {
    const xml = generarGetTokenFirmado('030530912644', CERTIFICADO);
    const sinFirma = '<getToken><item><Semilla>030530912644</Semilla></item></getToken>';
    const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)?.[1];
    const sig = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)?.[1];
    if (!digest || !sig) throw new Error('Token sin firma');

    expect(digest).toBe(sha1Base64(sinFirma));
    const ok = verify(
      'RSA-SHA1',
      Buffer.from(signedInfoEnvolvente(digest), 'utf8'),
      createPublicKey(CERTIFICADO_PEM),
      Buffer.from(sig, 'base64'),
    );
    expect(ok).toBe(true);
  });

  it('rechaza una semilla vacía', () => {
    expect(() => generarGetTokenFirmado('   ', CERTIFICADO)).toThrow(
      expect.objectContaining({ codigo: 'SEMILLA_VACIA' }),
    );
  });
});

describe('parsearRespuestaSii', () => {
  it('acepta el prefijo SII y normaliza el estado', () => {
    expect(parsearRespuestaSii(SEMILLA_XML)).toEqual({
      estado: 0,
      glosa: 'Semilla Generada',
      semilla: '030530912644',
      token: null,
    });
  });

  it('acepta respuestas sin prefijo', () => {
    const xml =
      '<RESPUESTA><RESP_BODY><TOKEN>abc</TOKEN></RESP_BODY>' +
      '<RESP_HDR><ESTADO>00</ESTADO></RESP_HDR></RESPUESTA>';
    expect(parsearRespuestaSii(xml)).toEqual({
      estado: 0,
      glosa: null,
      semilla: null,
      token: 'abc',
    });
  });

  it('falla si no viene ESTADO', () => {
    expect(() => parsearRespuestaSii('<RESPUESTA/>')).toThrow(
      expect.objectContaining({ codigo: 'SII_RESPUESTA_INVALIDA' }),
    );
  });
});

describe('ClienteSii', () => {
  it('obtiene la semilla desde el host de certificación', async () => {
    const { cliente, llamadas } = clienteCon(manejadorEstandar);
    const semilla = await cliente.obtenerSemilla();

    expect(semilla).toBe('030530912644');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe('https://apicert.sii.cl/recursos/v1/boleta.electronica.semilla');
    expect(llamadas[0]?.init.method).toBe('GET');
  });

  it('firma y envía el getToken', async () => {
    const { cliente, llamadas } = clienteCon(manejadorEstandar);
    const token = await cliente.obtenerToken('030530912644');

    expect(token).toBe('XAuSbYXiNh9Ik');
    const llamada = llamadas[0];
    expect(llamada?.url).toBe('https://apicert.sii.cl/recursos/v1/boleta.electronica.token');
    expect(llamada?.init.method).toBe('POST');
    expect(llamada?.init.body).toBe(generarGetTokenFirmado('030530912644', CERTIFICADO));
  });

  it('envía el EnvioBOLETA como multipart al host de envío', async () => {
    const { cliente, llamadas } = clienteCon(manejadorEstandar);
    const xml = '<EnvioBOLETA version="1.0"><SetDTE ID="SetDoc"></SetDTE></EnvioBOLETA>';
    const resultado = await cliente.enviarBoletas(xml, 'boleta-2026-10-25-10.xml');

    expect(resultado).toEqual({
      rutEmisor: RUT,
      rutEnvia: RUT,
      trackId: 1014,
      fechaRecepcion: '2026-10-25 18:37:31',
      estado: 'REC',
      archivo: 'boleta-2026-10-25-10.xml',
    });
    expect(llamadas.map((l) => l.url)).toEqual([
      'https://apicert.sii.cl/recursos/v1/boleta.electronica.semilla',
      'https://apicert.sii.cl/recursos/v1/boleta.electronica.token',
      'https://pangal.sii.cl/recursos/v1/boleta.electronica.envio',
    ]);

    const envio = llamadas[2];
    if (!envio) throw new Error('No se envió el EnvioBOLETA');
    expect(envio.init.method).toBe('POST');
    const headers = new Headers(envio.init.headers);
    expect(headers.get('cookie')).toBe('TOKEN=XAuSbYXiNh9Ik');
    expect(headers.get('user-agent')).toBe('AlmacenDeBarrio-POS/0.1');
    expect(headers.get('accept')).toBe('application/json');

    const contentType = headers.get('content-type') ?? '';
    const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
    expect(boundary).toBeTruthy();
    const cuerpo = cuerpoLatin1(envio.init);
    expect(cuerpo).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="rutSender"\r\n\r\n76086428\r\n`,
    );
    expect(cuerpo).toContain('name="dvSender"\r\n\r\n5\r\n');
    expect(cuerpo).toContain('name="rutCompany"\r\n\r\n76086428\r\n');
    expect(cuerpo).toContain('name="dvCompany"\r\n\r\n5\r\n');
    expect(cuerpo).toContain(
      `name="archivo"; filename="boleta-2026-10-25-10.xml"\r\nContent-Type: application/xml\r\n\r\n${xml}\r\n`,
    );
    expect(cuerpo.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('reutiliza el token entre envíos', async () => {
    const { cliente, llamadas } = clienteCon(manejadorEstandar);
    await cliente.enviarBoletas('<envio/>', 'a.xml');
    await cliente.enviarBoletas('<envio/>', 'b.xml');

    expect(llamadas.filter((l) => l.url.endsWith('/boleta.electronica.semilla'))).toHaveLength(1);
    expect(llamadas.filter((l) => l.url.endsWith('/boleta.electronica.token'))).toHaveLength(1);
    expect(llamadas.filter((l) => l.url.endsWith('/boleta.electronica.envio'))).toHaveLength(2);
  });

  it('renueva el token y reintenta una vez si el SII responde 401', async () => {
    let envios = 0;
    const { cliente, llamadas } = clienteCon((llamada) => {
      if (llamada.url.endsWith('/boleta.electronica.envio')) {
        envios += 1;
        return envios === 1 ? new Response('', { status: 401 }) : new Response(ENVIO_JSON);
      }
      return manejadorEstandar(llamada);
    });

    const resultado = await cliente.enviarBoletas('<envio/>', 'a.xml');
    expect(resultado.trackId).toBe(1014);
    expect(llamadas.filter((l) => l.url.endsWith('/boleta.electronica.semilla'))).toHaveLength(2);
    expect(llamadas.filter((l) => l.url.endsWith('/boleta.electronica.token'))).toHaveLength(2);
  });

  it('consulta el estado del envío y normaliza la respuesta', async () => {
    const { cliente, llamadas } = clienteCon(manejadorEstandar);
    const estado = await cliente.consultarEstado(1014);

    expect(estado.estado).toBe('EPR');
    expect(estado.trackId).toBe(1014);
    expect(estado.estadistica).toEqual([
      { tipo: 39, informados: 3, aceptados: 2, rechazados: 1, reparos: 0 },
      { tipo: 41, informados: 1, aceptados: 0, rechazados: 0, reparos: 1 },
    ]);
    expect(estado.detalle[0]?.folio).toBe(1202);
    expect(estado.detalle[0]?.errores[0]?.codigo).toBe(11);
    expect(estado.detalle[1]?.tipo).toBeNull();

    const consulta = llamadas[2];
    if (!consulta) throw new Error('No se consultó el estado');
    expect(consulta.url).toBe(
      'https://apicert.sii.cl/recursos/v1/boleta.electronica.envio/76086428-5-1014',
    );
    expect(new Headers(consulta.init.headers).get('cookie')).toBe('TOKEN=XAuSbYXiNh9Ik');
  });

  it('rechaza un track id que no es numérico', async () => {
    const { cliente } = clienteCon(manejadorEstandar);
    await expect(cliente.consultarEstado('abc')).rejects.toMatchObject({
      codigo: 'TRACKID_INVALIDO',
    });
  });

  it('usa los hosts de producción y permite sobreescribirlos', async () => {
    const produccion = clienteCon(manejadorEstandar, { ambiente: 'produccion' });
    await produccion.cliente.enviarBoletas('<envio/>', 'a.xml');
    expect(produccion.llamadas[0]?.url).toBe(
      'https://api.sii.cl/recursos/v1/boleta.electronica.semilla',
    );
    expect(produccion.llamadas.at(-1)?.url).toBe(
      'https://rahue.sii.cl/recursos/v1/boleta.electronica.envio',
    );

    const propio = clienteCon(manejadorEstandar, {
      baseApi: 'https://ejemplo.test/api',
      baseEnvio: 'https://ejemplo.test/envio',
    });
    await propio.cliente.enviarBoletas('<envio/>', 'a.xml');
    expect(propio.llamadas[0]?.url).toBe('https://ejemplo.test/api/boleta.electronica.semilla');
    expect(propio.llamadas.at(-1)?.url).toBe('https://ejemplo.test/envio/boleta.electronica.envio');
  });

  it('propaga el error de semilla del SII con su glosa', async () => {
    const { cliente } = clienteCon(
      () =>
        new Response(
          '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>' +
            '<SII:ESTADO>-1</SII:ESTADO><SII:GLOSA>Error Interno. Configuracion</SII:GLOSA>' +
            '</SII:RESP_HDR></SII:RESPUESTA>',
        ),
    );
    await expect(cliente.obtenerSemilla()).rejects.toMatchObject({
      codigo: 'SII_SEMILLA_RECHAZADA',
      message: 'Error Interno. Configuracion',
    });
  });

  it('propaga el error de token del SII con su glosa', async () => {
    const { cliente } = clienteCon(
      () =>
        new Response(
          '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>' +
            '<SII:ESTADO>05</SII:ESTADO><SII:GLOSA>XML Inválido, firma invalida</SII:GLOSA>' +
            '</SII:RESP_HDR></SII:RESPUESTA>',
        ),
    );
    await expect(cliente.obtenerToken('030530912644')).rejects.toMatchObject({
      codigo: 'SII_TOKEN_RECHAZADO',
      message: 'XML Inválido, firma invalida',
    });
  });

  it('traduce un error HTTP del SII', async () => {
    const { cliente } = clienteCon(() => new Response('mantenimiento', { status: 503 }));
    await expect(cliente.obtenerSemilla()).rejects.toMatchObject({ codigo: 'SII_HTTP' });
  });

  it('avisa cuando el SII limita los envíos', async () => {
    const { cliente } = clienteCon((llamada) => {
      if (llamada.url.endsWith('/boleta.electronica.envio')) {
        return new Response('', { status: 405 });
      }
      return manejadorEstandar(llamada);
    });
    await expect(cliente.enviarBoletas('<envio/>', 'a.xml')).rejects.toMatchObject({
      codigo: 'SII_LIMITE',
    });
  });

  it('rechaza un JSON inválido en el envío', async () => {
    const { cliente } = clienteCon((llamada) => {
      if (llamada.url.endsWith('/boleta.electronica.envio')) {
        return new Response('<html>error</html>');
      }
      return manejadorEstandar(llamada);
    });
    await expect(cliente.enviarBoletas('<envio/>', 'a.xml')).rejects.toMatchObject({
      codigo: 'SII_RESPUESTA_INVALIDA',
    });
  });

  it('traduce una caída de red', async () => {
    const fetchFn = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;
    const cliente = new ClienteSii({
      ambiente: 'certificacion',
      rutEmisor: RUT,
      rutEnvia: RUT,
      certificado: CERTIFICADO,
      fetchFn,
    });
    await expect(cliente.obtenerSemilla()).rejects.toMatchObject({
      codigo: 'SII_SIN_CONEXION',
    });
  });
});

describe('construirMultipart', () => {
  it('escapa el contenido del archivo en ISO-8859-1', () => {
    const cuerpo = construirMultipart(
      {
        rutSender: '76086428',
        dvSender: '5',
        rutCompany: '76086428',
        dvCompany: '5',
        archivo: { nombre: 'a.xml', contenido: '<NmbItem>Pan añejo</NmbItem>' },
      },
      'BOUNDARY',
    ).toString('latin1');

    expect(cuerpo).toContain('name="archivo"; filename="a.xml"');
    expect(cuerpo).toContain('<NmbItem>Pan añejo</NmbItem>');
    expect(cuerpo.endsWith('--BOUNDARY--\r\n')).toBe(true);
  });

  it('rechaza un nombre de archivo con caracteres peligrosos', () => {
    expect(() =>
      construirMultipart(
        {
          rutSender: '76086428',
          dvSender: '5',
          rutCompany: '76086428',
          dvCompany: '5',
          archivo: { nombre: '../a.xml', contenido: '<x/>' },
        },
        'BOUNDARY',
      ),
    ).toThrow(expect.objectContaining({ codigo: 'NOMBRE_ARCHIVO_INVALIDO' }));
  });
});

function clienteConFinal(respuesta: () => Response): {
  cliente: ClienteSii;
  llamadas: Llamada[];
} {
  return clienteCon((llamada) => {
    if (llamada.url.endsWith('/boleta.electronica.semilla')) return new Response(SEMILLA_XML);
    if (llamada.url.endsWith('/boleta.electronica.token')) return new Response(TOKEN_XML);
    return respuesta();
  });
}

describe('ClienteSii: validación y normalización', () => {
  it('usa el fetch global si no se inyecta uno', () => {
    const cliente = new ClienteSii({
      ambiente: 'certificacion',
      rutEmisor: RUT,
      rutEnvia: RUT,
      certificado: CERTIFICADO,
    });
    expect(cliente).toBeInstanceOf(ClienteSii);
  });

  it('rechaza un RUT de emisor inválido en el constructor', () => {
    expect(
      () =>
        new ClienteSii({
          ambiente: 'certificacion',
          rutEmisor: 'no-es-rut',
          rutEnvia: RUT,
          certificado: CERTIFICADO,
        }),
    ).toThrow(expect.objectContaining({ codigo: 'RUT_INVALIDO' }));
  });

  it('rechaza un RUT de envío inválido en el constructor', () => {
    expect(
      () =>
        new ClienteSii({
          ambiente: 'certificacion',
          rutEmisor: RUT,
          rutEnvia: 'no-es-rut',
          certificado: CERTIFICADO,
        }),
    ).toThrow(expect.objectContaining({ codigo: 'RUT_INVALIDO' }));
  });

  it('rechaza un ESTADO no numérico', () => {
    expect(() => parsearRespuestaSii('<RESPUESTA><ESTADO>abc</ESTADO></RESPUESTA>')).toThrow(
      expect.objectContaining({ codigo: 'SII_RESPUESTA_INVALIDA' }),
    );
  });

  it('rechaza un boundary multipart inválido', () => {
    expect(() =>
      construirMultipart(
        {
          rutSender: '76086428',
          dvSender: '5',
          rutCompany: '76086428',
          dvCompany: '5',
          archivo: { nombre: 'a.xml', contenido: '<x/>' },
        },
        'boundary con espacios',
      ),
    ).toThrow(expect.objectContaining({ codigo: 'BOUNDARY_INVALIDO' }));
  });

  it('traduce un error HTTP al pedir el token', async () => {
    const { cliente } = clienteCon(() => new Response('error', { status: 500 }));
    await expect(cliente.obtenerToken('030530912644')).rejects.toMatchObject({
      codigo: 'SII_HTTP',
    });
  });

  it('traduce un error HTTP al enviar las boletas', async () => {
    const { cliente } = clienteCon((llamada) => {
      if (llamada.url.endsWith('/boleta.electronica.envio')) {
        return new Response('error', { status: 500 });
      }
      return manejadorEstandar(llamada);
    });
    await expect(cliente.enviarBoletas('<envio/>', 'a.xml')).rejects.toMatchObject({
      codigo: 'SII_HTTP',
    });
  });

  it('reintenta la consulta si el SII responde 401', async () => {
    let consultas = 0;
    const { cliente, llamadas } = clienteCon((llamada) => {
      if (llamada.url.includes('/boleta.electronica.envio/')) {
        consultas += 1;
        return consultas === 1 ? new Response('', { status: 401 }) : new Response(ESTADO_JSON);
      }
      return manejadorEstandar(llamada);
    });

    const estado = await cliente.consultarEstado(1014);
    expect(estado.estado).toBe('EPR');
    expect(llamadas.filter((l) => l.url.endsWith('/boleta.electronica.semilla'))).toHaveLength(2);
  });

  it('avisa cuando el SII limita las consultas', async () => {
    const { cliente } = clienteCon((llamada) =>
      llamada.url.includes('/boleta.electronica.envio/')
        ? new Response('', { status: 405 })
        : manejadorEstandar(llamada),
    );
    await expect(cliente.consultarEstado(1014)).rejects.toMatchObject({
      codigo: 'SII_LIMITE',
    });
  });

  it('traduce un error HTTP al consultar el estado', async () => {
    const { cliente } = clienteCon((llamada) =>
      llamada.url.includes('/boleta.electronica.envio/')
        ? new Response('error', { status: 500 })
        : manejadorEstandar(llamada),
    );
    await expect(cliente.consultarEstado(1014)).rejects.toMatchObject({
      codigo: 'SII_HTTP',
    });
  });

  it('acepta trackid como string y completa los campos opcionales', async () => {
    const { cliente } = clienteConFinal(
      () => new Response(JSON.stringify({ trackid: '1014', estado: 'REC' })),
    );
    const resultado = await cliente.enviarBoletas('<envio/>', 'a.xml');

    expect(resultado).toEqual({
      rutEmisor: '76086428-5',
      rutEnvia: '76086428-5',
      trackId: 1014,
      fechaRecepcion: '',
      estado: 'REC',
      archivo: '',
    });
  });

  it('rechaza un envío sin trackid', async () => {
    const { cliente } = clienteConFinal(() => new Response(JSON.stringify({ estado: 'REC' })));
    await expect(cliente.enviarBoletas('<envio/>', 'a.xml')).rejects.toMatchObject({
      codigo: 'SII_RESPUESTA_INVALIDA',
    });
  });

  it('rechaza un envío con estado desconocido', async () => {
    const { cliente } = clienteConFinal(
      () => new Response(JSON.stringify({ trackid: 1, estado: 'XXX' })),
    );
    await expect(cliente.enviarBoletas('<envio/>', 'a.xml')).rejects.toMatchObject({
      codigo: 'SII_RESPUESTA_INVALIDA',
    });
  });

  it('rechaza una respuesta de envío que no es un objeto', async () => {
    const { cliente } = clienteConFinal(() => new Response('[]'));
    await expect(cliente.enviarBoletas('<envio/>', 'a.xml')).rejects.toMatchObject({
      codigo: 'SII_RESPUESTA_INVALIDA',
    });
  });

  it('rechaza una estadística con un tipo de DTE desconocido', async () => {
    const { cliente } = clienteConFinal(
      () =>
        new Response(
          JSON.stringify({
            trackid: 1,
            estado: 'EPR',
            estadistica: [{ tipo: 33, informados: 1 }],
          }),
        ),
    );
    await expect(cliente.consultarEstado(1)).rejects.toMatchObject({
      codigo: 'SII_RESPUESTA_INVALIDA',
    });
  });

  it('rechaza un detalle con un estado desconocido', async () => {
    const { cliente } = clienteConFinal(
      () =>
        new Response(
          JSON.stringify({
            trackid: 1,
            estado: 'EPR',
            detalle_rep_rech: [{ estado: 'XXX' }],
          }),
        ),
    );
    await expect(cliente.consultarEstado(1)).rejects.toMatchObject({
      codigo: 'SII_RESPUESTA_INVALIDA',
    });
  });

  it('usa listas vacías si el estado no trae estadística ni detalle', async () => {
    const { cliente } = clienteConFinal(
      () => new Response(JSON.stringify({ trackid: 1, estado: 'EPR' })),
    );
    const estado = await cliente.consultarEstado(1);
    expect(estado.estadistica).toEqual([]);
    expect(estado.detalle).toEqual([]);
  });

  it('acepta un detalle tipo 41 sin errores', async () => {
    const { cliente } = clienteConFinal(
      () =>
        new Response(
          JSON.stringify({
            trackid: 1,
            estado: 'EPR',
            detalle_rep_rech: [{ tipo: 41, folio: 2, estado: 'DOK', descripcion: 'ok' }],
          }),
        ),
    );
    const estado = await cliente.consultarEstado(1);
    expect(estado.detalle[0]?.tipo).toBe(41);
    expect(estado.detalle[0]?.errores).toEqual([]);
  });

  it('completa los campos opcionales de los errores', async () => {
    const { cliente } = clienteConFinal(
      () =>
        new Response(
          JSON.stringify({
            trackid: 1,
            estado: 'EPR',
            detalle_rep_rech: [{ estado: 'RCH', error: [{}] }],
          }),
        ),
    );
    const estado = await cliente.consultarEstado(1);
    expect(estado.detalle[0]?.errores[0]).toEqual({
      seccion: '',
      linea: 0,
      nivel: 0,
      codigo: 0,
      descripcion: '',
      detalle: '',
    });
  });

  it('acepta números como string en la estadística', async () => {
    const { cliente } = clienteConFinal(
      () =>
        new Response(
          JSON.stringify({
            trackid: 1,
            estado: 'EPR',
            estadistica: [
              {
                tipo: '39',
                informados: '3',
                aceptados: '2',
                rechazados: '1',
                reparos: '0',
              },
            ],
          }),
        ),
    );
    const estado = await cliente.consultarEstado(1);
    expect(estado.estadistica[0]).toEqual({
      tipo: 39,
      informados: 3,
      aceptados: 2,
      rechazados: 1,
      reparos: 0,
    });
  });
});
