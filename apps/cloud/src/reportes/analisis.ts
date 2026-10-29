/**
 * Reportes del dueño (app móvil → Reportes): ventas netas, lo más vendido con su margen,
 * ventas por hora y por día (hora de Chile) y un sugerido de compra. Funciones puras: el repo
 * trae las filas del período y aquí se agregan.
 */
import { dividirRedondeado, inicioDelDia, multiplicarSeguro, ZONA_CHILE } from '@almacen/core';
import { resumirVentas, type ResumenVentas } from './servicio.js';

export interface VentaReporte {
  id: string;
  createdAt: Date;
  totalClp: number;
  paymentMethod: string;
}

export interface LineaReporte {
  saleId: string;
  productId: string | null;
  nameSnapshot: string;
  unit: string;
  qtyMilli: number;
  lineTotalClp: number;
}

export interface DevolucionReporte {
  createdAt: Date;
  refundClp: number;
  paymentMethod: string;
  items: { productId: string | null; nameSnapshot: string; qtyMilli: number; amountClp: number }[];
}

export interface ProductoReporte {
  id: string;
  name: string;
  unit: string;
  costClp: number | null;
  stockMilli: number;
}

export interface ProductoVendido {
  productoId: string | null;
  nombre: string;
  unidad: string;
  cantidadMilli: number;
  montoClp: number;
  /** Venta − costo actual × cantidad. `null` si el producto no tiene costo. */
  margenClp: number | null;
}

export interface SugeridoCompra {
  id: string;
  nombre: string;
  unidad: string;
  stockMilli: number;
  /** Promedio vendido por día en el período. */
  ventaDiariaMilli: number;
  /** Días que alcanza el stock al ritmo actual. */
  diasDeStock: number;
  /** Para cubrir `DIAS_A_CUBRIR` días. */
  sugeridoMilli: number;
}

export interface ReporteDueno {
  desde: string;
  dias: number;
  ventas: ResumenVentas;
  ticketPromedioClp: number;
  masVendidos: ProductoVendido[];
  margen: {
    /** Ventas de productos con costo conocido. */
    ventasClp: number;
    costoClp: number;
    margenClp: number;
    /** Margen sobre la venta, en %, con un decimal. `null` sin ventas con costo. */
    porcentaje: number | null;
    /** Ventas de productos sin costo (no entran al margen). */
    sinCostoClp: number;
  };
  porHora: { hora: number; montoClp: number; cantidad: number }[];
  porDia: { fecha: string; montoClp: number; cantidad: number }[];
  sugeridoCompra: SugeridoCompra[];
}

/** Con menos de esto, el producto entra al sugerido de compra. */
export const DIAS_MINIMOS_DE_STOCK = 7;
/** El sugerido busca dejar stock para este período. */
export const DIAS_A_CUBRIR = 14;
const MAS_VENDIDOS = 10;
const MAX_SUGERIDOS = 20;
const DIA_MS = 24 * 60 * 60 * 1000;

const formatoChile = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_CHILE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function enChile(f: Date): { fecha: string; hora: number } {
  const p: Record<string, string> = {};
  for (const x of formatoChile.formatToParts(f)) p[x.type] = x.value;
  return {
    fecha: `${p['year'] ?? ''}-${p['month'] ?? ''}-${p['day'] ?? ''}`,
    hora: Number(p['hour'] ?? '0'),
  };
}

/** Inicio del período: las 00:00 de Chile de hace `dias − 1` días. */
export function inicioPeriodo(dias: number, ahora: Date): Date {
  return inicioDelDia(new Date(ahora.getTime() - (dias - 1) * DIA_MS));
}

const costoDe = (costoUnitarioClp: number, qtyMilli: number) =>
  dividirRedondeado(multiplicarSeguro(costoUnitarioClp, qtyMilli), 1000);

export function analizarVentas(datos: {
  dias: number;
  ahora: Date;
  ventas: readonly VentaReporte[];
  lineas: readonly LineaReporte[];
  devoluciones: readonly DevolucionReporte[];
  productos: readonly ProductoReporte[];
}): ReporteDueno {
  const { dias, ahora, ventas, lineas, devoluciones, productos } = datos;
  const desde = inicioPeriodo(dias, ahora);
  const producto = new Map(productos.map((p) => [p.id, p]));
  const resumen = resumirVentas(ventas, devoluciones);

  // Por producto (o por nombre en ventas rápidas sin producto), neto de devoluciones.
  const acumulado = new Map<string, ProductoVendido & { costoClp: number | null }>();
  const sumar = (
    productId: string | null,
    nombre: string,
    unidad: string,
    qtyMilli: number,
    montoClp: number,
  ) => {
    const clave = productId ?? `rapida:${nombre}`;
    const costo = productId ? (producto.get(productId)?.costClp ?? null) : null;
    const a = acumulado.get(clave) ?? {
      productoId: productId,
      nombre,
      unidad,
      cantidadMilli: 0,
      montoClp: 0,
      margenClp: null,
      costoClp: costo === null ? null : 0,
    };
    a.cantidadMilli += qtyMilli;
    a.montoClp += montoClp;
    if (costo !== null && a.costoClp !== null)
      a.costoClp += Math.sign(qtyMilli) * costoDe(costo, Math.abs(qtyMilli));
    acumulado.set(clave, a);
  };
  for (const l of lineas) sumar(l.productId, l.nameSnapshot, l.unit, l.qtyMilli, l.lineTotalClp);
  for (const d of devoluciones) {
    for (const i of d.items) {
      const unidad = (i.productId && producto.get(i.productId)?.unit) ?? 'UN';
      sumar(i.productId, i.nameSnapshot, unidad, -i.qtyMilli, -i.amountClp);
    }
  }
  const vendidos = [...acumulado.values()].map(({ costoClp, ...v }) => ({
    ...v,
    margenClp: costoClp === null ? null : v.montoClp - costoClp,
    costoClp,
  }));

  const conCosto = vendidos.filter((v) => v.costoClp !== null);
  const ventasConCosto = conCosto.reduce((s, v) => s + v.montoClp, 0);
  const costo = conCosto.reduce((s, v) => s + (v.costoClp ?? 0), 0);
  const margenClp = ventasConCosto - costo;

  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, montoClp: 0, cantidad: 0 }));
  const porDiaMapa = new Map<string, { montoClp: number; cantidad: number }>();
  for (let i = 0; i < dias; i++) {
    porDiaMapa.set(enChile(new Date(desde.getTime() + i * DIA_MS + DIA_MS / 2)).fecha, {
      montoClp: 0,
      cantidad: 0,
    });
  }
  for (const v of ventas) {
    const { fecha, hora } = enChile(v.createdAt);
    const h = porHora[hora];
    if (h) {
      h.montoClp += v.totalClp;
      h.cantidad += 1;
    }
    const d = porDiaMapa.get(fecha) ?? { montoClp: 0, cantidad: 0 };
    d.montoClp += v.totalClp;
    d.cantidad += 1;
    porDiaMapa.set(fecha, d);
  }
  for (const dev of devoluciones) {
    const d = porDiaMapa.get(enChile(dev.createdAt).fecha);
    if (d) d.montoClp -= dev.refundClp;
  }

  const sugeridoCompra: SugeridoCompra[] = [];
  for (const v of vendidos) {
    if (!v.productoId || v.cantidadMilli <= 0) continue;
    const p = producto.get(v.productoId);
    if (!p) continue;
    const ventaDiaria = v.cantidadMilli / dias;
    const diasDeStock = Math.max(0, p.stockMilli) / ventaDiaria;
    if (diasDeStock >= DIAS_MINIMOS_DE_STOCK) continue;
    const falta = ventaDiaria * DIAS_A_CUBRIR - p.stockMilli;
    // Por unidad, unidades enteras; por peso, de a 100 g.
    const paso = p.unit === 'KG' ? 100 : 1000;
    sugeridoCompra.push({
      id: p.id,
      nombre: p.name,
      unidad: p.unit,
      stockMilli: p.stockMilli,
      ventaDiariaMilli: Math.round(ventaDiaria),
      diasDeStock: Math.round(diasDeStock * 10) / 10,
      sugeridoMilli: Math.max(paso, Math.ceil(falta / paso) * paso),
    });
  }
  sugeridoCompra.sort((a, b) => a.diasDeStock - b.diasDeStock || a.nombre.localeCompare(b.nombre));

  return {
    desde: desde.toISOString(),
    dias,
    ventas: resumen,
    ticketPromedioClp: resumen.cantidad === 0 ? 0 : Math.round(resumen.totalClp / resumen.cantidad),
    masVendidos: vendidos
      .filter((v) => v.montoClp > 0)
      .sort((a, b) => b.montoClp - a.montoClp)
      .slice(0, MAS_VENDIDOS)
      .map(({ costoClp: _c, ...v }) => v),
    margen: {
      ventasClp: ventasConCosto,
      costoClp: costo,
      margenClp,
      porcentaje: ventasConCosto > 0 ? Math.round((margenClp * 1000) / ventasConCosto) / 10 : null,
      sinCostoClp: vendidos.filter((v) => v.costoClp === null).reduce((s, v) => s + v.montoClp, 0),
    },
    porHora,
    porDia: [...porDiaMapa.entries()]
      .map(([fecha, d]) => ({ fecha, ...d }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    sugeridoCompra: sugeridoCompra.slice(0, MAX_SUGERIDOS),
  };
}
