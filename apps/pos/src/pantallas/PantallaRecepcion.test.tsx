import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaRecepcion } from './PantallaRecepcion.js';

function montar() {
  const s = servidorConSesion();
  const u = userEvent.setup();
  render(<PantallaRecepcion api={s.api} />);
  const campo = screen.getByLabelText('Escanea lo que llegó');
  const escanear = (codigo: string) => u.type(campo, `${codigo}{Enter}`);
  return { s, u, campo, escanear };
}

describe('recepción de mercadería', () => {
  it('escanear suma; cantidad y costo por línea; guarda y muestra el stock nuevo', async () => {
    const { s, u, campo, escanear } = montar();
    expect(campo).toHaveFocus();
    await escanear('7801');
    await escanear('7801');
    await escanear('3*78040000');
    expect(await screen.findByLabelText('Cantidad de Bebida cola 1,5 L')).toHaveValue('2');
    expect(screen.getByLabelText('Cantidad de Galletas de vino')).toHaveValue('3');
    await u.type(screen.getByLabelText('Costo de Bebida cola 1,5 L'), '1500');
    expect(screen.getByText('Costo total: $3.000')).toBeInTheDocument();
    await escanear('7806'); // harina por kg: hay que escribir el peso
    await u.click(screen.getByRole('button', { name: /Guardar recepción \(3 productos\)/ }));
    expect(
      screen.getByText('Revisa la cantidad de Harina a granel (en kg, por ejemplo 2,5)'),
    ).toBeInTheDocument();
    await u.type(screen.getByLabelText('Cantidad de Harina a granel'), '2,5');
    await u.click(screen.getByRole('button', { name: /Guardar recepción/ }));

    const resumen = await screen.findByRole('status');
    expect(resumen).toHaveTextContent('Recepción guardada');
    expect(resumen).toHaveTextContent('Bebida cola 1,5 L: 24 → 26 · costo nuevo → $1.500');
    expect(resumen).toHaveTextContent('Harina a granel: 20,000 kg → 22,500 kg');
    expect(s.estado.recepciones[0]).toEqual({
      lineas: [
        { productoId: 'p1', cantidadMilli: 2000, costoUnitarioClp: 1500 },
        { productoId: 'p4', cantidadMilli: 3000 },
        { productoId: 'p6', cantidadMilli: 2500 },
      ],
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('quitar una línea y buscar por nombre', async () => {
    const { u, escanear } = montar();
    await escanear('7801');
    await u.click(await screen.findByRole('button', { name: 'Quitar Bebida cola 1,5 L' }));
    expect(screen.getByText('Escanea los productos que llegaron.')).toBeInTheDocument();
    await escanear('leche');
    const buscar = screen.getByRole('dialog', { name: 'Buscar producto' });
    await u.click(await within(buscar).findByText('Leche entera 1 L'));
    expect(screen.getByLabelText('Cantidad de Leche entera 1 L')).toHaveValue('1');
  });

  it('un código nuevo se da de alta sin preguntar stock (lo pone la recepción)', async () => {
    const { u, escanear } = montar();
    await escanear('7809');
    const alta = await screen.findByRole('dialog', { name: 'Producto nuevo en tu almacén' });
    expect(within(alta).queryByLabelText('Stock que hay ahora (opcional)')).not.toBeInTheDocument();
    await u.keyboard('2490{Enter}');
    expect(await screen.findByLabelText('Cantidad de Té verde')).toHaveValue('1');
  });

  it('avisa etiquetas de balanza, códigos inválidos y errores del servidor', async () => {
    const { s, u, escanear } = montar();
    await escanear('2501234002500');
    expect(
      await screen.findByText('Las etiquetas de balanza no se usan para recibir mercadería.'),
    ).toBeInTheDocument();
    await escanear('0000');
    expect(await screen.findByText('El código de barras no es válido')).toBeInTheDocument();
    await escanear('1000*7801');
    expect(await screen.findByText('La cantidad debe estar entre 1 y 999')).toBeInTheDocument();
    await escanear('7801');
    s.estado.forzar['POST /receptions'] = {
      status: 400,
      body: { error: 'PRODUCTO_NO_ENCONTRADO', mensaje: 'Línea 1: el producto no existe' },
    };
    await u.click(await screen.findByRole('button', { name: /Guardar recepción/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Línea 1: el producto no existe'),
    );
  });
});
