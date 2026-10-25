import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaVenta } from './PantallaVenta.js';

function montar(...args: Parameters<typeof servidorConSesion>) {
  const s = servidorConSesion(...args);
  const u = userEvent.setup();
  render(<PantallaVenta api={s.api} />);
  const campo = screen.getByLabelText('Escanea o escribe un código');
  const escanear = (codigo: string) => u.type(campo, `${codigo}{Enter}`);
  const lineas = () => screen.queryAllByRole('listitem').map((li) => li.textContent);
  return { s, u, campo, escanear, lineas };
}

describe('alta rápida al escanear un código desconocido', () => {
  it('producto de la base: muestra sus datos y solo pide precio y stock', async () => {
    const { s, u, escanear, lineas } = montar();
    await escanear('7809');
    const ventana = await screen.findByRole('dialog', { name: 'Producto nuevo en tu almacén' });
    expect(within(ventana).getByText('Té verde')).toBeInTheDocument();
    expect(within(ventana).getByText('Marca T · 20 bolsitas · 7809')).toBeInTheDocument();
    expect(within(ventana).queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(within(ventana).getByLabelText('Precio de venta')).toHaveFocus();
    await u.keyboard('2490');
    expect(within(ventana).getByLabelText('Precio de venta')).toHaveValue('$2.490');
    await u.type(within(ventana).getByLabelText('Stock que hay ahora (opcional)'), '6{Enter}');

    await waitFor(() => {
      expect(lineas()).toEqual(['Té verde1 x $2.490$2.490']);
    });
    expect(s.estado.creados[0]).toEqual({
      barcode: '7809',
      name: 'Té verde',
      brand: 'Marca T',
      format: '20 bolsitas',
      unit: 'UN',
      priceClp: 2490,
      stockInicialMilli: 6000,
      categorySlug: 'te',
      seedRef: '7809',
    });
    // Ya quedó registrado: el próximo escaneo lo suma directo.
    await escanear('7809');
    expect(lineas()).toEqual(['Té verde2 x $2.490$4.980']);
    expect(s.estado.creados).toHaveLength(1);
  });

  it('respeta "3*código" y el stock es opcional', async () => {
    const { s, u, escanear, lineas } = montar();
    await escanear('3*7809');
    await screen.findByRole('dialog', { name: 'Producto nuevo en tu almacén' });
    await u.keyboard('1000{Enter}');
    await waitFor(() => {
      expect(lineas()[0]).toContain('3 x $1.000');
    });
    expect(s.estado.creados[0]).not.toHaveProperty('stockInicialMilli');
  });

  it('producto que no está en ninguna base: pide nombre y unidad; por kg pregunta el peso', async () => {
    const { s, u, escanear } = montar();
    await escanear('7801234567894');
    const ventana = await screen.findByRole('dialog', { name: 'Producto desconocido' });
    expect(
      within(ventana).getByText(/El código 7801234567894 no está en la base de productos/),
    ).toBeInTheDocument();
    await u.click(within(ventana).getByRole('button', { name: 'Guardar y agregar (Enter)' }));
    expect(within(ventana).getByText('Escribe el nombre del producto')).toBeInTheDocument();
    await u.type(within(ventana).getByLabelText('Nombre'), 'Aceitunas a granel');
    await u.click(within(ventana).getByRole('button', { name: 'Por kg' }));
    await u.keyboard('{Enter}');
    expect(within(ventana).getByText('Escribe el precio de venta')).toBeInTheDocument();
    await u.type(within(ventana).getByLabelText('Precio por kg'), '6990');
    await u.type(within(ventana).getByLabelText('Stock que hay ahora (opcional)'), '2,5{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Aceitunas a granel' })).toBeInTheDocument();
    expect(s.estado.creados[0]).toMatchObject({
      name: 'Aceitunas a granel',
      unit: 'KG',
      priceClp: 6990,
      stockInicialMilli: 2500,
      seedRef: null,
    });
  });

  it('valida el stock según la unidad', async () => {
    const { u, escanear } = montar();
    await escanear('7809');
    const ventana = await screen.findByRole('dialog', { name: 'Producto nuevo en tu almacén' });
    await u.keyboard('1000');
    await u.type(within(ventana).getByLabelText('Stock que hay ahora (opcional)'), '1,5{Enter}');
    expect(within(ventana).getByText('El stock debe ser un número entero')).toBeInTheDocument();
  });

  it('muestra el error del servidor y Esc cierra sin agregar', async () => {
    const { u, escanear, lineas } = montar({
      forzar: {
        'POST /products': {
          status: 409,
          body: {
            error: 'CODIGO_EXISTE',
            mensaje: 'Ese código ya está registrado en otro producto',
          },
        },
      },
    });
    await escanear('7809');
    await screen.findByRole('dialog', { name: 'Producto nuevo en tu almacén' });
    await u.keyboard('1000{Enter}');
    expect(
      await screen.findByText('Ese código ya está registrado en otro producto'),
    ).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lineas()).toEqual([]);
  });

  it('una etiqueta de balanza sin producto asociado avisa (no se da de alta)', async () => {
    const { escanear } = montar({
      forzar: {
        'GET /products/lookup/2001234000017': {
          status: 200,
          body: {
            origen: 'NO_ENCONTRADO',
            producto: null,
            balanza: { codigoProducto: '01234', tipo: 'PESO', pesoGramos: 1 },
          },
        },
      },
    });
    await escanear('2001234000017');
    expect(
      await screen.findByText(
        'La etiqueta de balanza (producto 01234) no está asociada a ningún producto.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
