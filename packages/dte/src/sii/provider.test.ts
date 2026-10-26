import { calcularTotalesDocumento } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import type { LineaParaDte, TipoDte, VentaParaDte } from '../tipos.js';
import type { EstadoEnvioDetalladoSii, ResultadoEnvioSii } from './cliente.js';
import { MAX_BOLETAS_POR_ENVIO } from './envio.js';
import { NS_SII } from './documento.js';
import { parsearCaf } from './caf.js';
import {
  estadoDesdeRespuesta,
  MAX_INTENTOS_ENVIO,
  SiiDirectoProvider,
  type BoletaParaGuardarSii,
  type BoletaPendienteSii,
  type ClienteSiiPort,
  type RepositorioSii,
} from './provider.js';
import type { Caf, EmisorDte } from './tipos.js';
import { CERTIFICADO_PEM, CLAVE_PRIVADA_PEM, generarCafPrueba } from './test/ayudas.js';

const EMISOR: EmisorDte = {
  rut: '76.086.428-5',
  razonSocial: 'ALMACEN DE PRUEBA',
  giro: 'VENTA AL POR MENOR',
  direccion: 'AV. SIEMPRE VIVA 123',
  comuna: 'SANTIAGO',
};

const CERTIFICADO = { certificadoPem: CERTIFICADO_PEM, clavePrivadaPem: CLAVE_PRIVADA_PEM };

const CAF_39 = parsearCaf(generarCafPrueba({ tipoDte: 39, desde: 1, hasta: 100 }).xml);
const CAF_41 = parsearCaf(generarCafPrueba({ tipoDte: 41, desde: 500, hasta: 510 }).xml);

const T0 = new Date('2026-10-25T18:00:00-03:00');

const lineaAfecta: LineaParaDte = {
  nombre: 'Bebida cola 1,5 L',
  unidad: 'UN',
  cantidadMilli: 2000,
  precioUnitarioClp: 595,
  montoClp: 1190,
  tipoImpuesto: 'AFECTO',
};

const lineaExenta: LineaParaDte = {
  nombre: 'Pan corriente',
  unidad: 'KG',
  cantidadMilli: 1000,
  precioUnitarioClp: 1800,
  montoClp: 1800,
  tipoImpuesto: 'EXENTO',
};

function venta(tipo: TipoDte, id = `v-${tipo}`): VentaParaDte {
  const lineas = tipo === 39 ? [lineaAfecta] : [lineaExenta];
  return {
    ventaId: id,
    numeroVenta: 1,
    fecha: T0,
    medioPago: 'EFECTIVO',
    entrega: 'IMPRESA',
    lineas,
    totales: calcularTotalesDocumento(
      lineas.map((l) => ({ tipoImpuesto: l.tipoImpuesto, montoClp: l.montoClp })),
    ),
  };
}

interface DocMemoria extends BoletaPendienteSii {
  estado: 'PENDIENTE' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'REPARO';
  trackId: string | null;
  lastError: string | null;
}

/** Repositorio en memoria: misma semántica que el adaptador SQLite, sin base de datos. */
class RepoMemoria implements RepositorioSii {
  readonly cafs = new Map<TipoDte, Caf>();
  readonly proximo = new Map<TipoDte, number>();
  readonly docs: DocMemoria[] = [];
  readonly guardadas: BoletaParaGuardarSii[] = [];

  constructor() {
    for (const caf of [CAF_39, CAF_41]) {
      this.cafs.set(caf.tipoDte, caf);
      this.proximo.set(caf.tipoDte, caf.folioDesde);
    }
  }

  reservarFolio(tipoDte: TipoDte): Promise<{ caf: Caf; folio: number }> {
    const caf = this.cafs.get(tipoDte);
    if (!caf) {
      return Promise.reject(Object.assign(new Error('No hay CAF cargado'), { codigo: 'SIN_CAF' }));
    }
    const folio = this.proximo.get(tipoDte) ?? caf.folioDesde;
    if (folio > caf.folioHasta) {
      return Promise.reject(
        Object.assign(new Error('No quedan folios'), { codigo: 'CAF_AGOTADO' }),
      );
    }
    this.proximo.set(tipoDte, folio + 1);
    return Promise.resolve({ caf, folio });
  }

  guardarPendiente(boleta: BoletaParaGuardarSii): Promise<void> {
    this.guardadas.push(boleta);
    this.docs.push({
      id: `doc-${this.docs.length + 1}`,
      tipoDte: boleta.documento.tipoDte,
      folio: boleta.documento.folio,
      xml: boleta.documento.xml,
      intentos: 0,
      ultimoIntento: null,
      estado: 'PENDIENTE',
      trackId: null,
      lastError: null,
    });
    return Promise.resolve();
  }

  pendientes(): Promise<readonly BoletaPendienteSii[]> {
    return Promise.resolve(
      this.docs
        .filter((d) => d.estado === 'PENDIENTE')
        .map(({ id, tipoDte, folio, xml, intentos, ultimoIntento }) => ({
          id,
          tipoDte,
          folio,
          xml,
          intentos,
          ultimoIntento,
        })),
    );
  }

  marcarEnviada(
    id: string,
    datos: { trackId: string; estado: 'ENVIADO'; ahora: Date },
  ): Promise<void> {
    const d = this.docs.find((x) => x.id === id);
    if (d) {
      d.estado = datos.estado;
      d.trackId = datos.trackId;
      d.lastError = null;
    }
    return Promise.resolve();
  }

  marcarError(id: string, datos: { error: string; ahora: Date }): Promise<void> {
    const d = this.docs.find((x) => x.id === id);
    if (d) {
      d.intentos += 1;
      d.ultimoIntento = datos.ahora;
      d.lastError = datos.error;
    }
    return Promise.resolve();
  }

  actualizarEstado(trackId: string, estado: 'ACEPTADO' | 'RECHAZADO' | 'REPARO'): Promise<void> {
    for (const d of this.docs) {
      if (d.trackId === trackId) d.estado = estado;
    }
    return Promise.resolve();
  }

  agregarPendiente(tipoDte: TipoDte, folio: number, extras: Partial<DocMemoria> = {}): DocMemoria {
    const d: DocMemoria = {
      id: `doc-${this.docs.length + 1}`,
      tipoDte,
      folio,
      xml: `<DTE version="1.0" xmlns="${NS_SII}"><Documento ID="T${tipoDte}F${folio}"></Documento></DTE>`,
      intentos: 0,
      ultimoIntento: null,
      estado: 'PENDIENTE',
      trackId: null,
      lastError: null,
      ...extras,
    };
    this.docs.push(d);
    return d;
  }
}

function respuestaEnvio(trackId = 1014): ResultadoEnvioSii {
  return {
    rutEmisor: EMISOR.rut,
    rutEnvia: EMISOR.rut,
    trackId,
    fechaRecepcion: '2026-10-25 18:00:00',
    estado: 'REC',
    archivo: 'boleta.xml',
  };
}

function respuestaEstado(
  estado: ResultadoEnvioSii['estado'],
  detalle: EstadoEnvioDetalladoSii['detalle'] = [],
): EstadoEnvioDetalladoSii {
  return {
    rutEmisor: EMISOR.rut,
    rutEnvia: EMISOR.rut,
    trackId: 1014,
    fechaRecepcion: '2026-10-25 18:00:00',
    estado,
    estadistica: [],
    detalle,
  };
}

interface ClienteFalso extends ClienteSiiPort {
  readonly envios: { xml: string; nombre: string }[];
  readonly consultas: string[];
  responderEnvio: () => Promise<ResultadoEnvioSii>;
  responderEstado: EstadoEnvioDetalladoSii;
}

function clienteFalso(): ClienteFalso {
  const envios: { xml: string; nombre: string }[] = [];
  const consultas: string[] = [];
  const cliente: ClienteFalso = {
    envios,
    consultas,
    responderEnvio: () => Promise.resolve(respuestaEnvio()),
    responderEstado: respuestaEstado('EPR'),
    enviarBoletas(xml, nombre) {
      envios.push({ xml, nombre });
      return cliente.responderEnvio();
    },
    consultarEstado(trackId) {
      consultas.push(String(trackId));
      return Promise.resolve(cliente.responderEstado);
    },
  };
  return cliente;
}

function proveedor(
  repo: RepoMemoria,
  cliente: ClienteFalso = clienteFalso(),
  extras: Partial<Parameters<typeof construir>[0]> = {},
): SiiDirectoProvider {
  return construir({ repo, cliente, ...extras });
}

function construir({
  repo,
  cliente,
  ahora = () => T0,
  modelo = 'SOLO_NO_ELECTRONICOS' as const,
  maxIntentos = MAX_INTENTOS_ENVIO,
}: {
  repo: RepoMemoria;
  cliente: ClienteFalso;
  ahora?: () => Date;
  modelo?: 'SOLO_NO_ELECTRONICOS' | 'TODO_MEDIO_PAGO';
  maxIntentos?: number;
}): SiiDirectoProvider {
  return new SiiDirectoProvider({
    modelo,
    emisor: EMISOR,
    rutEnvia: EMISOR.rut,
    fchResol: '2026-01-01',
    nroResol: 80,
    certificado: CERTIFICADO,
    repositorio: repo,
    cliente,
    ahora,
    maxIntentos,
  });
}

describe('SiiDirectoProvider: emisión', () => {
  it('timbra offline, reserva el folio y deja la boleta pendiente de envío', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    const p = proveedor(repo, cliente);

    const r = await p.emitirBoleta(venta(39));

    expect(r.emitido).toBe(true);
    if (!r.emitido) throw new Error('no emitió');
    expect(r.documento).toMatchObject({
      provider: 'SII_DIRECTO',
      tipoDte: 39,
      folio: 1,
      folioExterno: null,
      estadoSii: 'PENDIENTE',
      validoComoBoleta: true,
      accionCajero: null,
    });
    expect(r.documento.xml).toContain('<DTE version="1.0"');
    expect(r.documento.xml).toContain('<Folio>1</Folio>');
    expect(r.documento.ted).toContain('<TED version="1.0">');
    expect(r.documento.leyendas).toEqual([
      'BOLETA ELECTRÓNICA',
      'Folio 1 · Total $1.190',
      'Verifique documento en www.sii.cl',
    ]);

    expect(repo.guardadas).toHaveLength(1);
    expect(repo.guardadas[0]?.documento.folio).toBe(1);
    expect(cliente.envios).toHaveLength(0);
  });

  it('usa el CAF 41 y su título para una venta exenta', async () => {
    const repo = new RepoMemoria();
    const r = await proveedor(repo).emitirBoleta(venta(41));

    if (!r.emitido) throw new Error('no emitió');
    expect(r.documento.tipoDte).toBe(41);
    expect(r.documento.folio).toBe(500);
    expect(r.documento.leyendas[0]).toBe('BOLETA ELECTRÓNICA EXENTA');
  });

  it('con tarjeta y modelo SOLO_NO_ELECTRONICOS no emite ni consume folio', async () => {
    const repo = new RepoMemoria();
    const p = proveedor(repo);
    const v = { ...venta(39), medioPago: 'CREDITO' as const };

    expect(await p.emitirBoleta(v)).toEqual({ emitido: false, motivo: 'VOUCHER_ES_BOLETA' });
    expect(repo.proximo.get(39)).toBe(1);
  });

  it('no emite una venta de total cero', async () => {
    const repo = new RepoMemoria();
    const p = proveedor(repo);
    const v = venta(39);
    const gratis: LineaParaDte = { ...lineaAfecta, precioUnitarioClp: 0, montoClp: 0 };
    const cero = {
      ...v,
      lineas: [gratis],
      totales: calcularTotalesDocumento([{ tipoImpuesto: 'AFECTO', montoClp: 0 }]),
    };

    expect(await p.emitirBoleta(cero)).toEqual({ emitido: false, motivo: 'TOTAL_CERO' });
  });

  it('falla si no hay CAF para el tipo de boleta', async () => {
    const repo = new RepoMemoria();
    repo.cafs.delete(41);
    await expect(proveedor(repo).emitirBoleta(venta(41))).rejects.toMatchObject({
      codigo: 'SIN_CAF',
    });
  });

  it('falla con CAF_AGOTADO cuando se acaban los folios', async () => {
    const repo = new RepoMemoria();
    repo.proximo.set(39, 101);
    await expect(proveedor(repo).emitirBoleta(venta(39))).rejects.toMatchObject({
      codigo: 'CAF_AGOTADO',
    });
  });

  it('dos emisiones seguidas usan folios correlativos', async () => {
    const repo = new RepoMemoria();
    const p = proveedor(repo);
    const a = await p.emitirBoleta(venta(39, 'v1'));
    const b = await p.emitirBoleta(venta(39, 'v2'));

    if (!a.emitido || !b.emitido) throw new Error('no emitió');
    expect([a.documento.folio, b.documento.folio]).toEqual([1, 2]);
  });
});

describe('SiiDirectoProvider: envío de pendientes', () => {
  it('envía el lote, deja el track id y marca las boletas como enviadas', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    const p = proveedor(repo, cliente);
    await p.emitirBoleta(venta(39, 'v1'));
    await p.emitirBoleta(venta(39, 'v2'));

    const resultados = await p.enviarPendientes();

    expect(resultados).toEqual([
      { folio: 1, trackId: '1014', estado: 'ENVIADO', error: null },
      { folio: 2, trackId: '1014', estado: 'ENVIADO', error: null },
    ]);
    expect(cliente.envios).toHaveLength(1);
    expect(cliente.envios[0]?.xml).toContain('<EnvioBOLETA');
    expect(cliente.envios[0]?.xml).toContain('<Folio>1</Folio>');
    expect(cliente.envios[0]?.xml).toContain('<Folio>2</Folio>');
    expect(cliente.envios[0]?.nombre).toMatch(/^boleta-\d{4}-\d{2}-\d{2}-1\.xml$/);
    expect(repo.docs.every((d) => d.estado === 'ENVIADO' && d.trackId === '1014')).toBe(true);
  });

  it('sin pendientes no llama al SII', async () => {
    const cliente = clienteFalso();
    const resultados = await proveedor(new RepoMemoria(), cliente).enviarPendientes();
    expect(resultados).toEqual([]);
    expect(cliente.envios).toHaveLength(0);
  });

  it(`parte la cola en lotes de ${MAX_BOLETAS_POR_ENVIO}`, async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    for (let i = 0; i < MAX_BOLETAS_POR_ENVIO + 2; i += 1) {
      repo.agregarPendiente(39, i + 1);
    }

    const resultados = await proveedor(repo, cliente).enviarPendientes();

    expect(resultados).toHaveLength(MAX_BOLETAS_POR_ENVIO + 2);
    expect(cliente.envios).toHaveLength(2);
    expect(cliente.envios[0]?.xml.match(/<DTE version=/g)).toHaveLength(MAX_BOLETAS_POR_ENVIO);
    expect(cliente.envios[1]?.xml.match(/<DTE version=/g)).toHaveLength(2);
  });

  it('registra el error, incrementa intentos y respeta la espera antes de reintentar', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    let reloj = T0.getTime();
    cliente.responderEnvio = () => Promise.reject(new Error('SII caído'));
    const p = proveedor(repo, cliente, { ahora: () => new Date(reloj) });
    await p.emitirBoleta(venta(39, 'v1'));

    const primero = await p.enviarPendientes();
    expect(primero).toEqual([{ folio: 1, trackId: null, estado: 'PENDIENTE', error: 'SII caído' }]);
    expect(repo.docs[0]).toMatchObject({
      estado: 'PENDIENTE',
      intentos: 1,
      lastError: 'SII caído',
    });

    // Antes de la espera base no se reintenta.
    expect(await p.enviarPendientes()).toEqual([]);
    expect(cliente.envios).toHaveLength(1);

    reloj += 60_000;
    cliente.responderEnvio = () => Promise.resolve(respuestaEnvio());
    const segundo = await p.enviarPendientes();
    expect(segundo).toEqual([{ folio: 1, trackId: '1014', estado: 'ENVIADO', error: null }]);
    expect(cliente.envios).toHaveLength(2);
  });

  it('no reintenta una boleta que agotó los intentos', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    repo.agregarPendiente(39, 1, { intentos: MAX_INTENTOS_ENVIO, ultimoIntento: T0 });

    expect(await proveedor(repo, cliente).enviarPendientes()).toEqual([]);
    expect(cliente.envios).toHaveLength(0);
  });

  it('marca error si el XML guardado ya no se puede enviar', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    repo.agregarPendiente(39, 1, { xml: '<roto/>' });

    const r = await proveedor(repo, cliente).enviarPendientes();

    expect(r[0]).toMatchObject({ estado: 'PENDIENTE', trackId: null });
    expect(r[0]?.error).toContain('forma esperada');
    expect(repo.docs[0]?.intentos).toBe(1);
    expect(cliente.envios).toHaveLength(0);
  });

  it('se detiene en el primer lote con error y no envía el resto', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    for (let i = 0; i < MAX_BOLETAS_POR_ENVIO + 1; i += 1) repo.agregarPendiente(39, i + 1);
    cliente.responderEnvio = () => Promise.reject(new Error('HTTP 503'));

    const r = await proveedor(repo, cliente).enviarPendientes();

    expect(r).toHaveLength(MAX_BOLETAS_POR_ENVIO);
    expect(cliente.envios).toHaveLength(1);
    expect(repo.docs.filter((d) => d.intentos === 1)).toHaveLength(MAX_BOLETAS_POR_ENVIO);
    expect(repo.docs.at(-1)?.intentos).toBe(0);
  });
});

describe('SiiDirectoProvider: consulta de estado', () => {
  it('acepta cuando todos los documentos están DOK', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    const d = repo.agregarPendiente(39, 1, { estado: 'ENVIADO', trackId: '1014' });
    cliente.responderEstado = respuestaEstado('EPR', [
      { tipo: 39, folio: 1, estado: 'DOK', descripcion: '', errores: [] },
    ]);

    expect(await proveedor(repo, cliente).consultarEstado('1014')).toBe('ACEPTADO');
    expect(cliente.consultas).toEqual(['1014']);
    expect(d.estado).toBe('ACEPTADO');
  });

  it('marca reparo si algún documento tiene RPR', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    repo.agregarPendiente(39, 1, { estado: 'ENVIADO', trackId: '1014' });
    cliente.responderEstado = respuestaEstado('EPR', [
      { tipo: 39, folio: 1, estado: 'DOK', descripcion: '', errores: [] },
      { tipo: 39, folio: 2, estado: 'RPR', descripcion: '', errores: [] },
    ]);

    expect(await proveedor(repo, cliente).consultarEstado('1014')).toBe('REPARO');
  });

  it('marca rechazo si algún documento tiene RCH', async () => {
    const repo = new RepoMemoria();
    const cliente = clienteFalso();
    repo.agregarPendiente(39, 1, { estado: 'ENVIADO', trackId: '1014' });
    cliente.responderEstado = respuestaEstado('EPR', [
      { tipo: 39, folio: 1, estado: 'RCH', descripcion: '', errores: [] },
    ]);

    expect(await proveedor(repo, cliente).consultarEstado('1014')).toBe('RECHAZADO');
  });

  it('sin detalle deja el envío como ENVIADO mientras el SII procesa', async () => {
    const cliente = clienteFalso();
    cliente.responderEstado = respuestaEstado('PRD');

    expect(await proveedor(new RepoMemoria(), cliente).consultarEstado('1014')).toBe('ENVIADO');
  });
});

describe('estadoDesdeRespuesta', () => {
  it.each([
    ['REC', 'ENVIADO'],
    ['EPR', 'ENVIADO'],
    ['CRT', 'ENVIADO'],
    ['FOK', 'ENVIADO'],
    ['PRD', 'ENVIADO'],
    ['SOK', 'ENVIADO'],
    ['RCH', 'RECHAZADO'],
    ['RCO', 'RECHAZADO'],
    ['VOF', 'RECHAZADO'],
    ['RFR', 'RECHAZADO'],
    ['RPT', 'RECHAZADO'],
    ['RSC', 'RECHAZADO'],
    ['RCT', 'RECHAZADO'],
    ['RPR', 'REPARO'],
  ] as const)('traduce el estado global %s a %s', (entrada, esperado) => {
    expect(estadoDesdeRespuesta(respuestaEstado(entrada))).toBe(esperado);
  });
});
