/**
 * Datos mínimos para desarrollo y demos. NO son productos reales: los códigos de barras
 * usan el prefijo 780 con números ficticios (dígito verificador válido).
 * PINs de prueba: dueño 1234, cajero 0000.
 */
import { calcularDigitoGtin } from '@almacen/core';
import { hashearPin } from '../auth/pin.js';
import type { Db } from './client.js';
import * as t from './schema.js';

const ean = (doce: string): string => `${doce}${calcularDigitoGtin(doce)}`;

type NuevoProducto = typeof t.products.$inferInsert & { stockInicialMilli: number };

/** Siembra la base si está vacía. Devuelve `false` si ya tenía datos. */
export function sembrar(db: Db): boolean {
  if (db.select().from(t.storeSettings).all().length > 0) return false;

  db.transaction((tx) => {
    tx.insert(t.storeSettings)
      // Datos de desarrollo: MOCK (la caja muestra "MODO PRUEBA"). Una instalación real parte
      // en PUENTE_MANUAL (valor por defecto de la columna, ADR-001).
      .values({ razonSocial: 'Almacén de Prueba', comuna: 'Santiago', dteProvider: 'MOCK' })
      .run();
    tx.insert(t.registers).values({ name: 'Caja 1' }).run();
    const [dueno] = tx
      .insert(t.users)
      .values([
        { name: 'Dueño', role: 'DUENO', pinHash: hashearPin('1234') },
        { name: 'Cajero', role: 'CAJERO', pinHash: hashearPin('0000') },
      ])
      .returning()
      .all();

    const cat = Object.fromEntries(
      tx
        .insert(t.categories)
        .values(
          [
            'Bebidas',
            'Abarrotes',
            'Lácteos',
            'Panadería',
            'Frutas y verduras',
            'Botillería',
            'Otros',
          ].map((name) => ({ name })),
        )
        .returning()
        .all()
        .map((c) => [c.name, c.id]),
    );

    const productos: NuevoProducto[] = [
      {
        name: 'Bebida cola 1,5 L',
        brand: 'Genérica',
        format: '1,5 L',
        barcode: ean('780000000001'),
        priceClp: 1890,
        costClp: 1350,
        categoryId: cat.Bebidas,
        extraTaxCode: 'IABA',
        stockInicialMilli: 24_000,
      },
      {
        name: 'Agua mineral 500 ml',
        brand: 'Genérica',
        format: '500 ml',
        barcode: ean('780000000002'),
        priceClp: 690,
        costClp: 420,
        categoryId: cat.Bebidas,
        stockInicialMilli: 36_000,
      },
      {
        name: 'Arroz grado 1',
        brand: 'Genérica',
        format: '1 kg',
        barcode: ean('780000000003'),
        priceClp: 1490,
        costClp: 1100,
        categoryId: cat.Abarrotes,
        stockInicialMilli: 12_000,
      },
      {
        name: 'Galletas de vino',
        brand: 'Genérica',
        format: '150 g',
        barcode: ean('780000000004'),
        priceClp: 890,
        costClp: 560,
        categoryId: cat.Abarrotes,
        stockInicialMilli: 30_000,
      },
      {
        name: 'Leche entera 1 L',
        brand: 'Genérica',
        format: '1 L',
        barcode: ean('780000000005'),
        priceClp: 1190,
        costClp: 900,
        categoryId: cat['Lácteos'],
        stockInicialMilli: 2_000,
        stockMinMilli: 6_000,
      },
      {
        name: 'Cerveza lata 470 cc',
        brand: 'Genérica',
        format: '470 cc',
        barcode: ean('780000000006'),
        priceClp: 1290,
        costClp: 850,
        categoryId: cat['Botillería'],
        extraTaxCode: 'ILA',
        stockInicialMilli: 48_000,
      },
      {
        name: 'Pan corriente',
        unit: 'KG',
        priceClp: 1990,
        categoryId: cat['Panadería'],
        stockInicialMilli: 0,
      },
      {
        name: 'Tomate',
        unit: 'KG',
        priceClp: 1490,
        categoryId: cat['Frutas y verduras'],
        stockInicialMilli: 8_500,
      },
      {
        name: 'Huevo (unidad)',
        priceClp: 250,
        categoryId: cat.Abarrotes,
        stockInicialMilli: 90_000,
      },
      {
        name: 'Queso laminado',
        unit: 'KG',
        priceClp: 11_990,
        scaleCode: '01234',
        categoryId: cat['Lácteos'],
        stockInicialMilli: 3_250,
      },
      {
        name: 'Producto exento (ejemplo)',
        taxType: 'EXENTO',
        barcode: ean('780000000007'),
        priceClp: 1000,
        categoryId: cat.Otros,
        stockInicialMilli: 5_000,
      },
    ];

    const creados = productos.map(({ stockInicialMilli, ...p }) => {
      const [prod] = tx
        .insert(t.products)
        .values({ ...p, stockQtyMilli: stockInicialMilli })
        .returning()
        .all();
      if (!prod) throw new Error(`No se pudo crear ${p.name}`);
      if (stockInicialMilli > 0) {
        tx.insert(t.stockMovements)
          .values({
            productId: prod.id,
            qtyMilli: stockInicialMilli,
            type: 'RECEPCION',
            userId: dueno?.id,
          })
          .run();
      }
      return prod;
    });
    const porNombre = (nombre: string) => {
      const p = creados.find((c) => c.name === nombre);
      if (!p) throw new Error(`Falta ${nombre}`);
      return p;
    };

    // Mismo producto, otro código (ej. pack o código antiguo).
    tx.insert(t.productBarcodes)
      .values({ barcode: ean('780000000099'), productId: porNombre('Agua mineral 500 ml').id })
      .run();
    tx.insert(t.promotions)
      .values({ productId: porNombre('Galletas de vino').id, packQty: 2, packPriceClp: 1500 })
      .run();
    tx.insert(t.quickButtons)
      .values(
        ['Pan corriente', 'Huevo (unidad)', 'Tomate'].map((nombre, i) => ({
          label: nombre.replace(' (unidad)', ''),
          productId: porNombre(nombre).id,
          position: i + 1,
        })),
      )
      .run();
  });
  return true;
}
