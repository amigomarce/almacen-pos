import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  const total = () => screen.getByLabelText('Total');
  return { s, u, campo, escanear, lineas, total };
}

describe('pantalla de venta', () => {
  it('el campo de escaneo tiene el foco desde el inicio', () => {
    const { campo } = montar();
    expect(campo).toHaveFocus();
    expect(screen.getByText('Escanea un producto para empezar')).toBeInTheDocument();
  });

  it('escanear agrega; escanear de nuevo suma 1', async () => {
    const { escanear, lineas, total } = montar();
    await escanear('7801');
    await escanear('7801');
    expect(lineas()).toEqual(['Bebida cola 1,5 L2 x $1.890$3.780']);
    await waitFor(() => expect(total()).toHaveTextContent('$3.780'));
    expect(total()).toHaveTextContent('2 artículos');
  });

  it('"3*código" agrega 3 unidades', async () => {
    const { escanear, lineas } = montar();
    await escanear('3*7801');
    expect(lineas()[0]).toContain('3 x $1.890');
  });

  it('muestra la promoción calculada por el servidor', async () => {
    const { escanear, total } = montar();
    await escanear('3*78040000');
    await waitFor(() => expect(total()).toHaveTextContent('$2.390'));
    expect(screen.getByText(/promoción -\$280/)).toBeInTheDocument();
  });

  it('etiqueta de balanza con peso', async () => {
    const { escanear, lineas } = montar();
    await escanear('2501234002500');
    expect(lineas()).toEqual(['Queso laminado0,250 kg x $11.990/kg$2.998']);
  });

  it('avisa balanza mal configurada, códigos inválidos y cantidades fuera de rango', async () => {
    const { escanear, lineas } = montar();
    await escanear('2509999002500');
    expect(
      await screen.findByText('Bebida cola 1,5 L está configurado por unidad, no por peso.'),
    ).toBeInTheDocument();
    await escanear('0000');
    expect(await screen.findByText('El código de barras no es válido')).toBeInTheDocument();
    await escanear('1000*7801');
    expect(await screen.findByText('La cantidad debe estar entre 1 y 999')).toBeInTheDocument();
    expect(lineas()).toEqual([]);
  });

  it('avisa (sin bloquear) cuando el stock queda en 0 o negativo', async () => {
    const { escanear, lineas } = montar();
    await escanear('7805');
    expect(
      await screen.findByText('Stock en 0 o negativo: Leche entera 1 L. Revisa el inventario.'),
    ).toBeInTheDocument();
    expect(lineas()).toHaveLength(1);
  });

  it('etiqueta de balanza con precio: cobra ese monto exacto', async () => {
    const { escanear, lineas, total } = montar();
    await escanear('2601234012000');
    expect(lineas()).toEqual(['Queso laminado≈0,100 kg x $11.990/kg · por monto$1.200']);
    await waitFor(() => expect(total()).toHaveTextContent('$1.200'));
  });

  it('F2 busca por nombre; un producto por peso pide los kg', async () => {
    const { u, lineas } = montar();
    await u.keyboard('{F2}');
    const ventana = screen.getByRole('dialog', { name: 'Buscar producto' });
    await u.type(within(ventana).getByLabelText('Nombre, marca o código'), 'tom');
    await within(ventana).findByText('Tomate');
    await u.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Tomate' })).toBeInTheDocument();
    await u.keyboard('1,25');
    expect(screen.getByLabelText('Equivale a')).toHaveTextContent('= $1.863');
    await u.keyboard('{Enter}');
    expect(lineas()).toEqual(['Tomate1,250 kg x $1.490/kg$1.863']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('escribir texto y Enter abre la búsqueda con ese texto; se elige con flechas o clic', async () => {
    const { u, escanear, lineas } = montar();
    await escanear('leche');
    const ventana = screen.getByRole('dialog', { name: 'Buscar producto' });
    expect(within(ventana).getByLabelText('Nombre, marca o código')).toHaveValue('leche');
    await u.click(await within(ventana).findByText('Leche entera 1 L'));
    expect(lineas()[0]).toContain('Leche entera 1 L');
  });

  it('Enter antes de que aparezcan los resultados igual elige el primero', async () => {
    const { u, lineas } = montar();
    await u.keyboard('{F2}');
    await u.keyboard('bebida{Enter}');
    await waitFor(() => {
      expect(lineas()[0]).toContain('Bebida cola');
    });
  });

  it('Enter con un texto sin resultados no agrega nada', async () => {
    const { u, lineas } = montar();
    await u.keyboard('{F2}');
    await u.keyboard('qqq{Enter}');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(lineas()).toEqual([]);
  });

  it('la búsqueda muestra "Sin resultados" y se cierra con Esc', async () => {
    const { u, campo } = montar();
    await u.keyboard('{F2}');
    await u.type(screen.getByLabelText('Nombre, marca o código'), 'zzz');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    await u.keyboard('{ArrowDown}{ArrowUp}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it('F4 cambia la cantidad de la línea seleccionada y valida', async () => {
    const { u, escanear, lineas } = montar();
    await escanear('7801');
    await u.keyboard('{F4}');
    expect(screen.getByRole('dialog', { name: 'Cantidad' })).toBeInTheDocument();
    await u.keyboard('{Enter}');
    expect(screen.getByText('Escribe una cantidad entera mayor a 0')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: '5' }));
    await u.keyboard('{Enter}');
    expect(lineas()[0]).toContain('5 x $1.890');
  });

  it('un producto por peso con código normal pide el peso', async () => {
    const { u, escanear, lineas } = montar();
    await escanear('7806');
    expect(await screen.findByRole('dialog', { name: 'Harina a granel' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: ',' }));
    await u.click(screen.getByRole('button', { name: '5' }));
    await u.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(lineas()).toEqual(['Harina a granel0,500 kg x $1.200/kg$600']);
  });

  it('flechas, +, − y Supr sobre la línea seleccionada', async () => {
    const { u, escanear, lineas } = montar();
    await escanear('7801');
    await escanear('78040000');
    await u.keyboard('{ArrowUp}++');
    expect(lineas()[0]).toContain('3 x $1.890');
    await u.keyboard('-');
    expect(lineas()[0]).toContain('2 x $1.890');
    await u.keyboard('{Delete}');
    expect(lineas()).toHaveLength(1);
    expect(lineas()[0]).toContain('Galletas');
  });

  it('Esc limpia lo escrito; con productos, Esc dos veces cancela la venta', async () => {
    const { u, campo, escanear, lineas } = montar();
    await escanear('7801');
    await u.type(campo, '78');
    await u.keyboard('{Escape}');
    expect(campo).toHaveValue('');
    await u.keyboard('{Escape}');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Presiona Esc otra vez para cancelar la venta',
    );
    expect(lineas()).toHaveLength(1);
    await u.keyboard('{Escape}');
    expect(lineas()).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('Venta cancelada.');
  });

  it('botones en pantalla: +1, −1, quitar y cancelar (con confirmación)', async () => {
    const { u, escanear, lineas } = montar();
    await escanear('7801');
    await u.click(screen.getByRole('button', { name: '+1' }));
    expect(lineas()[0]).toContain('2 x');
    await u.click(screen.getByRole('button', { name: '−1' }));
    expect(lineas()[0]).toContain('1 x');
    await escanear('78040000');
    await u.click(screen.getByRole('button', { name: 'Quitar (Supr)' }));
    expect(lineas()).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Cancelar venta (Esc)' }));
    await u.click(screen.getByRole('button', { name: '¿Seguro? Toca otra vez' }));
    expect(lineas()).toEqual([]);
  });

  it('el foco vuelve al campo de escaneo después de tocar una línea o un botón', async () => {
    const { u, campo, escanear } = montar();
    await escanear('7801');
    await escanear('78040000');
    await u.click(screen.getByText('Bebida cola 1,5 L'));
    await waitFor(() => expect(campo).toHaveFocus());
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('un escaneo con la búsqueda abierta se reconoce, cierra la ventana y agrega el producto', async () => {
    const { u, lineas } = montar();
    await u.keyboard('{F2}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // El lector tipea muy rápido y termina en Enter.
    act(() => {
      for (const key of [...Array.from('78040000'), 'Enter'])
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
    await waitFor(() => {
      expect(lineas()[0]).toContain('Galletas de vino');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el error del servidor al cotizar', async () => {
    const { escanear } = montar({
      forzar: {
        'POST /sales/quote': {
          status: 400,
          body: { error: 'PRODUCTO_NO_ENCONTRADO', mensaje: 'Línea 1: el producto ya no existe' },
        },
      },
    });
    await escanear('7801');
    expect(await screen.findByText('Línea 1: el producto ya no existe')).toBeInTheDocument();
  });

  it('botones de venta rápida: por unidad agrega directo; por peso pide kg o monto', async () => {
    const { u, lineas, total } = montar();
    await u.click(await screen.findByRole('button', { name: /Leche/ }));
    expect(lineas()[0]).toContain('Leche entera 1 L');
    await u.click(screen.getByRole('button', { name: /Pan/ }));
    const ventana = screen.getByRole('dialog', { name: 'Pan corriente' });
    await u.click(within(ventana).getByRole('button', { name: 'Monto ($)' }));
    await u.keyboard('1000');
    expect(screen.getByLabelText('Equivale a')).toHaveTextContent('≈ 0,503 kg');
    await u.keyboard('{Enter}');
    expect(lineas()[1]).toBe('Pan corriente≈0,503 kg x $1.990/kg · por monto$1.000');
    await waitFor(() => expect(total()).toHaveTextContent('$2.190'));
  });

  it('Tab cambia entre peso y monto; valida lo escrito', async () => {
    const { u } = montar();
    await u.click(await screen.findByRole('button', { name: /Pan/ }));
    await u.keyboard('{Enter}');
    expect(screen.getByText('Escribe el peso en kg, por ejemplo 1,250')).toBeInTheDocument();
    await u.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Monto ($)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await u.keyboard('{Enter}');
    expect(screen.getByText('Escribe el monto que pide el cliente')).toBeInTheDocument();
    await u.keyboard('05{Backspace}7,');
    expect(screen.getByLabelText('Monto')).toHaveTextContent('$7');
  });

  it('F4 sobre una línea por peso permite pasarla a monto y de vuelta a kg', async () => {
    const { u, escanear, lineas } = montar();
    await escanear('2501234002500'); // queso 0,250 kg
    await u.keyboard('{F4}');
    expect(screen.getByRole('button', { name: 'Peso (kg)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await u.keyboard('{Tab}3000{Enter}');
    expect(lineas()[0]).toContain('· por monto$3.000');
    await u.keyboard('{F4}');
    expect(screen.getByRole('button', { name: 'Monto ($)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await u.keyboard('{Tab}0,5{Enter}');
    expect(lineas()[0]).toBe('Queso laminado0,500 kg x $11.990/kg$5.995');
  });

  it('venta sin código: botón con nombre o "Sin código" con monto libre', async () => {
    const { u, lineas, total } = montar();
    await u.click(await screen.findByRole('button', { name: 'Bolsa' }));
    const ventana = screen.getByRole('dialog', { name: 'Venta sin código' });
    expect(within(ventana).getByLabelText('Qué se vende')).toHaveValue('Bolsa');
    await u.keyboard('{Enter}');
    expect(within(ventana).getByText('Escribe el monto')).toBeInTheDocument();
    await u.click(within(ventana).getByRole('button', { name: '5' }));
    await u.click(within(ventana).getByRole('button', { name: '0' }));
    await u.click(within(ventana).getByRole('button', { name: 'Agregar' }));
    expect(lineas()).toEqual(['Bolsa1 x $50$50']);

    await u.click(screen.getByRole('button', { name: /Sin código/ }));
    const otra = screen.getByRole('dialog', { name: 'Venta sin código' });
    await u.clear(within(otra).getByLabelText('Qué se vende'));
    await u.type(within(otra).getByLabelText('Monto'), '1500{Enter}');
    expect(lineas()[1]).toBe('Varios1 x $1.500$1.500');
    await waitFor(() => expect(total()).toHaveTextContent('$1.550'));
  });
});
