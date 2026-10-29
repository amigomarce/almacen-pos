import { cuadrarCaja } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import { aEscPos, aTexto, CMD } from '../escpos.js';
import { ticketCierre, textoDiferencia } from './cierre.js';
import { ticketPrueba } from './prueba.js';
import { ticketVenta, type DatosTicketVenta } from './venta.js';

const local = {
  razonSocial: 'Almacén Doña Rosa',
  rut: '76.086.428-5',
  direccion: 'Av. Los Aromos 123',
  comuna: 'Ñuñoa',
};

const venta: DatosTicketVenta = {
  local,
  numero: 15,
  fecha: new Date('2026-10-25T12:44:00Z'),
  cajero: 'Sofía',
  lineas: [
    {
      nombre: 'Bebida cola 1,5 L',
      unidad: 'UN',
      cantidadMilli: 2000,
      precioUnitarioClp: 1890,
      descuentoClp: 0,
      totalLineaClp: 3780,
    },
    {
      nombre: 'Tomate',
      unidad: 'KG',
      cantidadMilli: 1250,
      precioUnitarioClp: 1490,
      descuentoClp: 0,
      totalLineaClp: 1863,
    },
    {
      nombre: 'Galletas de vino',
      unidad: 'UN',
      cantidadMilli: 3000,
      precioUnitarioClp: 890,
      descuentoClp: 280,
      totalLineaClp: 2390,
    },
  ],
  totalClp: 8033,
  redondeoClp: -3,
  totalCobradoClp: 8030,
  medioPago: 'EFECTIVO',
  pagadoClp: 10000,
  vueltoClp: 1970,
  exentoClp: 0,
  documento: {
    leyendas: [
      'COMPROBANTE DE VENTA – NO VÁLIDO COMO BOLETA',
      'Su boleta se emite en la app e-Boleta del SII',
    ],
    folioExterno: '123',
    validoComoBoleta: false,
  },
  motivoSinDocumento: null,
  anulada: false,
};

describe('ticketVenta', () => {
  it('58 mm (32 columnas): comprobante de venta en efectivo con redondeo, promoción y folio', () => {
    expect(aTexto(ticketVenta(venta, 32))).toMatchInlineSnapshot(`
      "       Almacén Doña Rosa
              RUT 76.086.428-5
         Av. Los Aromos 123, Ñuñoa
      --------------------------------
      COMPROBANTE DE VENTA - NO VÁLIDO
                COMO BOLETA
      --------------------------------
      Venta N° 15
      25-10-2026 09:44   Cajero: Sofía
      --------------------------------
      Bebida cola 1,5 L
        2 x $1.890              $3.780
      Tomate
        1,250 kg x $1.490/kg    $1.863
      Galletas de vino
        3 x $890                $2.670
        Descuento                -$280
      --------------------------------
      T O T A L           $ 8 . 0 3 3
      Redondeo efectivo            -$3
      Total a pagar             $8.030
      Efectivo                 $10.000
      Vuelto                    $1.970
      --------------------------------
        Su boleta se emite en la app
              e-Boleta del SII
          Folio e-Boleta SII: 123

           Gracias por su compra"
    `);
  });

  it('80 mm (48 columnas): con tarjeta, el voucher es la boleta', () => {
    const doc = ticketVenta(
      {
        ...venta,
        medioPago: 'DEBITO',
        redondeoClp: 0,
        totalCobradoClp: 8033,
        pagadoClp: 8033,
        vueltoClp: 0,
        documento: null,
        motivoSinDocumento: 'VOUCHER_ES_BOLETA',
        lineas: venta.lineas.slice(0, 1),
      },
      48,
    );
    expect(aTexto(doc)).toMatchInlineSnapshot(`
      "               Almacén Doña Rosa
                      RUT 76.086.428-5
                 Av. Los Aromos 123, Ñuñoa
      ------------------------------------------------
        COMPROBANTE DE VENTA - NO VÁLIDO COMO BOLETA
      ------------------------------------------------
      Venta N° 15
      25-10-2026 09:44                   Cajero: Sofía
      ------------------------------------------------
      Bebida cola 1,5 L
        2 x $1.890                              $3.780
      ------------------------------------------------
      T O T A L                           $ 8 . 0 3 3
      Pagado con Débito                         $8.033
      ------------------------------------------------
           La boleta es el voucher de la tarjeta

                   Gracias por su compra"
    `);
  });

  it('siempre dice que no es boleta, aun sin documento', () => {
    for (const d of [
      venta,
      { ...venta, documento: null, motivoSinDocumento: 'TOTAL_CERO' as const },
    ]) {
      const texto = aTexto(ticketVenta(d, 32));
      expect(texto).toContain('NO VÁLIDO');
      expect(texto).not.toContain('voucher');
    }
  });

  it('imprime la boleta electrónica válida con folio, IVA, verificación y resolución', () => {
    const texto = aTexto(
      ticketVenta(
        {
          ...venta,
          netoClp: 6750,
          ivaClp: 1283,
          resolucion: { numero: 80, fecha: '2026-01-01' },
          documento: {
            tipoDte: 39,
            folio: 123,
            leyendas: [],
            folioExterno: null,
            validoComoBoleta: true,
          },
        },
        32,
      ),
    );
    expect(texto).toContain('BOLETA ELECTRÓNICA');
    expect(texto).toContain('N° 123');
    expect(texto).not.toContain('NO VÁLIDO');
    expect(texto).not.toContain('Venta N°');
    expect(texto).toMatch(/Neto\s+\$6\.750/);
    expect(texto).toMatch(/IVA 19%\s+\$1\.283/);
    const plano = texto.replace(/\s+/g, ' ');
    expect(plano).toContain('Verifique documento en www.sii.cl');
    expect(plano).toContain('Resolución SII N° 80 de 2026-01-01');
  });

  it('boleta exenta 41: no imprime neto ni IVA', () => {
    const texto = aTexto(
      ticketVenta(
        {
          ...venta,
          exentoClp: 8033,
          documento: {
            tipoDte: 41,
            folio: 7,
            leyendas: [],
            folioExterno: null,
            validoComoBoleta: true,
          },
        },
        32,
      ),
    );
    expect(texto).toContain('BOLETA ELECTRÓNICA EXENTA');
    expect(texto).not.toMatch(/\bNeto\b/);
    expect(texto).not.toMatch(/\bIVA\b/);
    expect(texto).toMatch(/Exento\s+\$8\.033/);
  });

  it('deriva el desglose de IVA si el servidor no manda neto/IVA', () => {
    const texto = aTexto(
      ticketVenta(
        {
          ...venta,
          documento: {
            tipoDte: 39,
            folio: 1,
            leyendas: [],
            folioExterno: null,
            validoComoBoleta: true,
          },
        },
        48,
      ),
    );
    expect(texto).toMatch(/Neto\s+\$6\.750/);
    expect(texto).toMatch(/IVA 19%\s+\$1\.283/);
  });

  it('marca anuladas, reimpresiones y montos exentos', () => {
    const texto = aTexto(
      ticketVenta({ ...venta, anulada: true, reimpresion: true, exentoClp: 1000 }, 32),
    );
    expect(texto).toContain('* * *   A N U L A D A   * * *');
    expect(texto).toContain('REIMPRESIÓN');
    expect(texto).toMatch(/Incluye exento\s+\$1\.000/);
  });

  it('abre el cajón solo en efectivo y nunca en una reimpresión', () => {
    const abre = (d: Partial<DatosTicketVenta>) =>
      Buffer.from(
        aEscPos(ticketVenta({ ...venta, abrirCajon: true, ...d }, 32), { paginaCodigos: 'CP858' }),
      ).includes(Buffer.from(CMD.abrirCajon));
    expect(abre({})).toBe(true);
    expect(abre({ medioPago: 'DEBITO' })).toBe(false);
    expect(abre({ reimpresion: true })).toBe(false);
    expect(abre({ abrirCajon: false })).toBe(false);
  });

  it('local sin datos: usa "Almacén" y omite RUT y dirección', () => {
    const texto = aTexto(
      ticketVenta(
        { ...venta, local: { razonSocial: null, rut: null, direccion: null, comuna: null } },
        32,
      ),
    );
    expect(texto.split('\n')[0]?.trim()).toBe('Almacén');
    expect(texto).not.toContain('RUT');
  });
});

describe('ticketCierre', () => {
  const resumen = cuadrarCaja(10000, [
    { medioPago: 'EFECTIVO', totalClp: 8033, redondeoClp: -3, anulada: false },
    { medioPago: 'DEBITO', totalClp: 5990, redondeoClp: 0, anulada: false },
    { medioPago: 'EFECTIVO', totalClp: 1000, redondeoClp: 0, anulada: true },
  ]);
  const datos = {
    local: { ...local, giro: 'Minimarket' },
    caja: 'Caja 1',
    abiertaEn: new Date('2026-10-25T11:00:00Z'),
    abiertaPor: 'Sofía',
    cerradaEn: new Date('2026-10-25T23:30:00Z'),
    cerradaPor: 'Dueño',
    resumen,
    efectivoContadoClp: 17700,
    diferenciaClp: 17700 - resumen.efectivoEsperadoClp,
  };

  it('58 mm: totales por medio, esperado, contado, diferencia y aviso de anuladas', () => {
    expect(aTexto(ticketCierre(datos, 32))).toMatchInlineSnapshot(`
      "       Almacén Doña Rosa
              RUT 76.086.428-5
                 Minimarket
         Av. Los Aromos 123, Ñuñoa
      --------------------------------
        C I E R R E   D E   C A J A
                   Caja 1
      Apertura        25-10-2026 08:00
                             por Sofía
      Cierre          25-10-2026 20:30
                             por Dueño
      --------------------------------
      Ventas                         2
      Efectivo (1)              $8.030
      Débito (1)                $5.990
      Crédito (0)                   $0
      Transferencia (0)             $0
      Total cobrado            $14.020
        Redondeo efectivo          -$3
      Anuladas (1)              $1.000
      --------------------------------
      Efectivo inicial         $10.000
      + Cobrado en efectivo     $8.030
      = Esperado en caja       $18.030
      Contado                  $17.700
           F A L T A N   $ 3 3 0
      --------------------------------
      Hay ventas anuladas: revisa si
      falta anular boletas en sii.cl o
      pagos con tarjeta.
      --------------------------------

      Firma: ____________________"
    `);
  });

  it('suma los ingresos, resta los retiros y lista cada movimiento con su motivo', () => {
    const conMovimientos = cuadrarCaja(
      10000,
      [{ medioPago: 'EFECTIVO', totalClp: 5000, redondeoClp: 0, anulada: false }],
      [
        { tipo: 'RETIRO', montoClp: 8000 },
        { tipo: 'INGRESO', montoClp: 2000 },
      ],
    );
    const texto = aTexto(
      ticketCierre(
        {
          ...datos,
          resumen: conMovimientos,
          efectivoContadoClp: 9000,
          diferenciaClp: 0,
          movimientos: [
            { tipo: 'RETIRO', montoClp: 8000, motivo: 'Pan Ideal' },
            { tipo: 'INGRESO', montoClp: 2000, motivo: 'Sencillo' },
          ],
        },
        32,
      ),
    );
    expect(texto).toContain('+ Ingresos de efectivo    $2.000');
    expect(texto).toContain('- Retiros de efectivo     $8.000');
    expect(texto).toContain('= Esperado en caja        $9.000');
    expect(texto).toContain('Retiros e ingresos');
    expect(texto).toMatch(/Pan Ideal\s+-\$8\.000/);
    expect(texto).toMatch(/Sencillo\s+\+\$2\.000/);
  });

  it('las devoluciones se informan y las de efectivo bajan el esperado', () => {
    const conDevolucion = cuadrarCaja(
      10000,
      [{ medioPago: 'EFECTIVO', totalClp: 5000, redondeoClp: 0, anulada: false }],
      [],
      [{ medioPago: 'EFECTIVO', totalClp: 1293, redondeoClp: -3 }],
    );
    const texto = aTexto(
      ticketCierre(
        { ...datos, resumen: conDevolucion, efectivoContadoClp: 13710, diferenciaClp: 0 },
        32,
      ),
    );
    expect(texto).toMatch(/Devoluciones \(1\)\s+\$1\.293/);
    expect(texto).toMatch(/- Devoluciones efectivo\s+\$1\.290/);
    expect(texto).toMatch(/= Esperado en caja\s+\$13\.710/);
  });

  it('sin anuladas ni redondeo no muestra esas líneas', () => {
    const limpio = cuadrarCaja(0, [
      { medioPago: 'DEBITO', totalClp: 1000, redondeoClp: 0, anulada: false },
    ]);
    const texto = aTexto(
      ticketCierre({ ...datos, resumen: limpio, efectivoContadoClp: 0, diferenciaClp: 0 }, 32),
    );
    expect(texto).not.toContain('Anuladas');
    expect(texto).not.toContain('Redondeo');
    expect(texto).toContain('C U A D R A');
  });

  it.each([
    [0, 'CUADRA'],
    [10, 'SOBRAN $10'],
    [-790, 'FALTAN $790'],
  ])('diferencia %i → %s', (d, texto) => {
    expect(textoDiferencia(d)).toBe(texto);
  });
});

describe('ticketPrueba', () => {
  it('la regla ocupa exactamente el ancho, y puede probar el cajón', () => {
    for (const columnas of [32, 42, 48]) {
      const doc = ticketPrueba({ columnas, paginaCodigos: 'CP858' });
      const lineas = aTexto(doc).split('\n');
      expect(lineas).toContain('1234567890'.repeat(5).slice(0, columnas));
      expect(doc.abrirCajon).toBe(false);
    }
    expect(
      ticketPrueba({ columnas: 32, paginaCodigos: 'CP850', anchoMm: 58, abrirCajon: true })
        .abrirCajon,
    ).toBe(true);
  });

  it('58 mm en CP850', () => {
    expect(aTexto(ticketPrueba({ columnas: 32, paginaCodigos: 'CP850', anchoMm: 58 }), 'CP850'))
      .toMatchInlineSnapshot(`
      "       P R U E B A   D E
             I M P R E S I Ó N
        Papel 58 mm · 32 columnas ·
                   CP850
      ================================
      12345678901234567890123456789012
      --------------------------------
      Acentos: áéíóú ÁÉÍÓÚ ü
      Eñes: ñandú Ñuñoa · ¿Precio?
      ¡Oferta!
      Venta N° 1 · $1.290 · 1,250 kg
      --------------------------------
      Negrita
      G R A N D E
      Izquierda
                   Centro
                               Derecha
      --------------------------------
      Si los acentos y la ñ se ven
      bien, la página de códigos es
      correcta. Si la regla se corta o
      sobra espacio, ajusta las
      columnas."
    `);
  });
});
