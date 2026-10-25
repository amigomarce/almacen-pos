import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '../db/schema.js';
import { abrirCaja, cerrarCaja } from '../caja/servicio.js';
import { cargarTaxonomiaPorDefecto, crearProducto } from '../productos/alta.js';
import { editarProducto } from '../productos/gestion.js';
import { anularVenta, registrarVenta } from '../ventas/servicio.js';
import { prepararApp, type CtxPrueba } from '../test/sesion.js';

let c: CtxPrueba;

const eventos = () => c.db.select().from(t.outbox).orderBy(t.outbox.createdAt).all();
const porEntidad = (entity: string, op?: string) =>
  eventos().filter((e) => e.entity === entity && (op === undefined || e.op === op));

beforeEach(() => {
  c = prepararApp();
});

describe('encolado de eventos en el outbox local', () => {
  it('crea un producto: INSERT de producto y de stock inicial', () => {
    const p = crearProducto(
      c.db,
      { name: 'Snack nuevo', priceClp: 990, unit: 'UN', stockInicialMilli: 3000 },
      c.cajeroId,
      cargarTaxonomiaPorDefecto(),
    );
    expect(porEntidad('products', 'INSERT')).toHaveLength(1);
    expect(porEntidad('products', 'INSERT')[0]?.entityId).toBe(p.id);
    expect(porEntidad('stock_movements', 'INSERT')).toHaveLength(1);
  });

  it('editar un producto encola un UPDATE con el precio nuevo', () => {
    const p = crearProducto(
      c.db,
      { name: 'Snack nuevo', priceClp: 990, unit: 'UN' },
      c.cajeroId,
      cargarTaxonomiaPorDefecto(),
    );
    editarProducto(c.db, p.id, { priceClp: 1090 }, c.duenoId);
    const u = porEntidad('products', 'UPDATE');
    expect(u).toHaveLength(1);
    expect(u[0]?.entityId).toBe(p.id);
    expect((u[0]?.payload as { priceClp: number }).priceClp).toBe(1090);
  });

  it('vender encola venta, líneas y movimientos; anular encola el UPDATE', async () => {
    const reg = c.db.select().from(t.registers).get();
    const prod = c.db
      .select()
      .from(t.products)
      .where(eq(t.products.name, 'Agua mineral 500 ml'))
      .get();
    if (!reg || !prod) throw new Error('seed de test incompleta');
    c.db
      .insert(t.cashSessions)
      .values({ registerId: reg.id, openedBy: c.cajeroId, openingCash: 10000 })
      .run();

    const r = await registrarVenta(c.db, {
      pedido: {
        id: randomUUID(),
        medioPago: 'EFECTIVO',
        lineas: [{ productoId: prod.id, cantidadMilli: 2000 }],
      },
      registerId: reg.id,
      cajeroId: c.cajeroId,
    });

    expect(porEntidad('sales', 'INSERT')).toHaveLength(1);
    expect(porEntidad('sale_items', 'INSERT')).toHaveLength(1);
    expect(porEntidad('stock_movements', 'INSERT')).toHaveLength(1);

    await anularVenta(c.db, {
      ventaId: r.venta.id,
      autorizadaPorId: c.duenoId,
      motivo: 'prueba',
      soloUltima: true,
      usuarioId: c.cajeroId,
    });

    expect(porEntidad('sales', 'UPDATE')).toHaveLength(1);
    expect(porEntidad('sales', 'UPDATE')[0]?.entityId).toBe(r.venta.id);
    const anulacion = porEntidad('stock_movements', 'INSERT').filter(
      (e) => (e.payload as { type: string }).type === 'ANULACION',
    );
    expect(anulacion).toHaveLength(1);
  });

  it('cerrar caja encola un evento cash_closes para el móvil', () => {
    const reg = c.db.select().from(t.registers).get();
    if (!reg) throw new Error('seed de test incompleta');
    abrirCaja(c.db, { registerId: reg.id, usuarioId: c.cajeroId, efectivoInicialClp: 10000 });
    cerrarCaja(c.db, { registerId: reg.id, usuarioId: c.cajeroId, efectivoContadoClp: 10000 });

    const cierres = porEntidad('cash_closes', 'INSERT');
    expect(cierres).toHaveLength(1);
    expect(cierres[0]?.payload).toMatchObject({
      registerId: reg.id,
      registerName: 'Caja 1',
      countedCashClp: 10000,
      expectedCashClp: 10000,
      differenceClp: 0,
    });
  });
});
