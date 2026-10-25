import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaProductos } from './PantallaProductos.js';

function montar(esDueno = true, ...args: Parameters<typeof servidorConSesion>) {
  const s = servidorConSesion(...args);
  const u = userEvent.setup();
  render(<PantallaProductos api={s.api} esDueno={esDueno} />);
  const busqueda = screen.getByLabelText('Buscar producto');
  const filas = () =>
    within(screen.getByRole('table', { name: 'Productos' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
  return { s, u, busqueda, filas };
}

describe('pantalla de productos', () => {
  it('busca por nombre y muestra precio y stock', async () => {
    const { u, busqueda, filas } = montar();
    expect(
      screen.getByText('Busca un producto por nombre, escanéalo o elige un filtro.'),
    ).toBeInTheDocument();
    await u.type(busqueda, 'leche');
    await waitFor(() => {
      expect(filas()).toEqual(['Leche entera 1 L7805$1.1901']);
    });
  });

  it('filtro de stock bajo', async () => {
    const { u, filas } = montar();
    await u.click(screen.getByRole('button', { name: 'Stock bajo' }));
    await waitFor(() => {
      expect(filas()).toEqual(['Pan corriente—$1.990/kg0,000 kg']);
    });
    await u.click(screen.getByRole('button', { name: 'Todos' }));
    expect(
      screen.getByText('Busca un producto por nombre, escanéalo o elige un filtro.'),
    ).toBeInTheDocument();
  });

  it('el dueño cambia el precio, el costo y ve el margen', async () => {
    const { s, u, busqueda } = montar();
    await u.type(busqueda, 'leche');
    await u.click(await screen.findByText('Leche entera 1 L'));
    const ficha = await screen.findByRole('dialog', { name: 'Leche entera 1 L' });
    const precio = await within(ficha).findByLabelText('Precio de venta');
    expect(precio).toHaveValue('$1.190');
    await u.clear(precio);
    await u.type(precio, '1290');
    await u.type(within(ficha).getByLabelText('Costo unitario (opcional)'), '900');
    expect(within(ficha).getByLabelText('Margen')).toHaveTextContent('Margen: 30 %');
    await u.type(within(ficha).getByLabelText('Stock mínimo'), '6');
    await u.click(within(ficha).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(ficha).findByText('Cambios guardados.')).toBeInTheDocument();
    expect(s.estado.ediciones[0]).toEqual({
      id: 'p5',
      cuerpo: { priceClp: 1290, costClp: 900, stockMinMilli: 6000 },
    });
    await u.click(within(ficha).getByRole('button', { name: 'Guardar cambios' }));
    expect(within(ficha).getByText('No hay cambios que guardar.')).toBeInTheDocument();
  });

  it('valida precio, nombre y stock mínimo', async () => {
    const { s, u, busqueda } = montar();
    await u.type(busqueda, 'harina');
    await u.click(await screen.findByText('Harina a granel'));
    const ficha = await screen.findByRole('dialog', { name: 'Harina a granel' });
    await u.clear(await within(ficha).findByLabelText('Precio por kg'));
    await u.click(within(ficha).getByRole('button', { name: 'Guardar cambios' }));
    expect(within(ficha).getByText('El precio debe ser mayor a $0')).toBeInTheDocument();
    await u.type(within(ficha).getByLabelText('Precio por kg'), '1300');
    await u.type(within(ficha).getByLabelText('Stock mínimo (kg)'), 'x,1,2,3,4');
    await u.click(within(ficha).getByRole('button', { name: 'Guardar cambios' }));
    expect(
      within(ficha).getByText('El stock mínimo va en kg, por ejemplo 2,5'),
    ).toBeInTheDocument();
    await u.clear(within(ficha).getByLabelText('Stock mínimo (kg)'));
    await u.clear(within(ficha).getByLabelText('Nombre'));
    await u.click(within(ficha).getByRole('button', { name: 'Guardar cambios' }));
    expect(within(ficha).getByText('El nombre no puede quedar vacío')).toBeInTheDocument();
    expect(s.estado.ediciones).toHaveLength(0);
  });

  it('contar stock y registrar merma', async () => {
    const { s, u, busqueda } = montar();
    await u.type(busqueda, 'tomate');
    await u.click(await screen.findByText('Tomate'));
    const ficha = await screen.findByRole('dialog', { name: 'Tomate' });
    expect(await within(ficha).findByLabelText('Stock actual')).toHaveTextContent('8,500 kg');
    await u.click(within(ficha).getByRole('button', { name: 'Contar stock' }));
    await u.type(within(ficha).getByLabelText('¿Cuánto hay en sala (kg)?'), '7,25{Enter}');
    expect(await within(ficha).findByText('Stock actualizado: 7,250 kg')).toBeInTheDocument();
    await u.click(within(ficha).getByRole('button', { name: 'Merma' }));
    await u.type(within(ficha).getByLabelText('¿Cuánto se perdió (kg)?'), 'abc');
    await u.click(within(ficha).getByRole('button', { name: 'Aplicar' }));
    expect(
      within(ficha).getByText('Escribe la cantidad en kg, por ejemplo 1,5'),
    ).toBeInTheDocument();
    await u.type(within(ficha).getByLabelText('¿Cuánto se perdió (kg)?'), '0,25');
    await u.click(within(ficha).getByRole('button', { name: 'Aplicar' }));
    expect(await within(ficha).findByLabelText('Stock actual')).toHaveTextContent('7,000 kg');
    expect(s.estado.ajustes.map((a) => a.cuerpo)).toEqual([
      { tipo: 'CONTEO', stockContadoMilli: 7250 },
      { tipo: 'MERMA', cantidadMilli: 250 },
    ]);
  });

  it('el cajero solo mira: campos bloqueados, sin guardar ni ajustar stock', async () => {
    const { u, busqueda } = montar(false);
    await u.type(busqueda, 'leche');
    await u.click(await screen.findByText('Leche entera 1 L'));
    const ficha = await screen.findByRole('dialog', { name: 'Leche entera 1 L' });
    expect(
      await within(ficha).findByText(
        'Solo el dueño puede cambiar precios, stock y datos del producto.',
      ),
    ).toBeInTheDocument();
    expect(within(ficha).getByLabelText('Precio de venta')).toBeDisabled();
    expect(
      within(ficha).queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument();
    expect(within(ficha).queryByRole('button', { name: 'Contar stock' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Botones de venta rápida' }),
    ).not.toBeInTheDocument();
  });

  it('escanear un código del local abre su ficha; uno de la base abre el alta y luego la ficha', async () => {
    const { u, busqueda } = montar();
    await u.type(busqueda, '7801{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Bebida cola 1,5 L' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Cerrar (Esc)' }));
    await u.clear(busqueda);
    await u.type(busqueda, '7809{Enter}');
    const alta = await screen.findByRole('dialog', { name: 'Producto nuevo en tu almacén' });
    expect(within(alta).getByLabelText('Stock que hay ahora (opcional)')).toBeInTheDocument();
    await u.keyboard('2490{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Té verde' })).toBeInTheDocument();
  });

  it('un código sin resultados ofrece darlo de alta', async () => {
    const { u, busqueda } = montar();
    await u.type(busqueda, '7801234567894');
    await u.click(
      await screen.findByRole('button', { name: 'Dar de alta el código 7801234567894' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Producto desconocido' })).toBeInTheDocument();
  });

  it('nuevo producto sin código', async () => {
    const { u } = montar();
    await u.click(screen.getByRole('button', { name: 'Nuevo sin código' }));
    expect(screen.getByRole('dialog', { name: 'Producto desconocido' })).toHaveTextContent(
      'Producto sin código.',
    );
  });
});

describe('editor de botones de venta rápida', () => {
  it('ordena, quita, agrega producto y monto libre, y guarda', async () => {
    const { s, u } = montar();
    await u.click(screen.getByRole('button', { name: 'Botones de venta rápida' }));
    const editor = screen.getByRole('dialog', { name: 'Botones de venta rápida' });
    const actuales = () =>
      within(within(editor).getByRole('list', { name: 'Botones actuales' }))
        .getAllByRole('listitem')
        .map((li) => li.querySelector('strong')?.textContent);
    await waitFor(() => {
      expect(actuales()).toEqual(['Pan', 'Leche', 'Bolsa']);
    });
    await u.click(within(editor).getByRole('button', { name: 'Bajar Pan' }));
    await u.click(within(editor).getByRole('button', { name: 'Quitar Bolsa' }));
    expect(actuales()).toEqual(['Leche', 'Pan']);
    await u.type(within(editor).getByLabelText('Agregar un producto'), 'tomate');
    await u.click(await within(editor).findByRole('button', { name: /Tomate/ }));
    await u.type(within(editor).getByLabelText('O un botón de monto libre'), 'Recarga');
    await u.click(within(editor).getByRole('button', { name: 'Agregar' }));
    expect(actuales()).toEqual(['Leche', 'Pan', 'Tomate', 'Recarga']);
    await u.click(within(editor).getByRole('button', { name: 'Guardar botones' }));
    expect(await within(editor).findByText('Botones guardados.')).toBeInTheDocument();
    expect(s.estado.botonesGuardados[0]).toEqual([
      { label: 'Leche', productoId: 'p5' },
      { label: 'Pan', productoId: 'p7' },
      { label: 'Tomate', productoId: 'p2' },
      { label: 'Recarga', productoId: null },
    ]);
  });
});

describe('ventanas', () => {
  it('Esc cierra la ficha del producto', async () => {
    const { u, busqueda } = montar();
    await u.type(busqueda, 'leche');
    await u.click(await screen.findByText('Leche entera 1 L'));
    await screen.findByRole('dialog', { name: 'Leche entera 1 L' });
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
