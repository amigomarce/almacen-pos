import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { SeccionVentasTurno } from './SeccionVentasTurno.js';

const sesion = {
  id: 's1',
  abiertaPor: { id: 'u2', name: 'Cajero' },
  abiertaEn: '',
  efectivoInicialClp: 10000,
};

async function preparar(esDueno: boolean) {
  const s = servidorConSesion({ sesionCaja: { ...sesion } });
  const dueno = s.estado.usuarios.find((x) => x.role === 'DUENO');
  if (esDueno && dueno) s.estado.tokens.set('t-prueba', dueno);
  await s.api.registrarVenta({
    id: crypto.randomUUID(),
    lineas: [{ productoId: 'p1', cantidadMilli: 2000 }],
    medioPago: 'EFECTIVO',
  });
  await s.api.registrarVenta({
    id: crypto.randomUUID(),
    lineas: [{ productoId: 'p1', cantidadMilli: 1000 }],
    medioPago: 'DEBITO',
  });
  const u = userEvent.setup();
  const alCambiar = vi.fn();
  render(<SeccionVentasTurno api={s.api} esDueno={esDueno} version={0} alCambiar={alCambiar} />);
  return { s, u, alCambiar };
}

describe('ventas del turno', () => {
  it('lista las ventas del turno, de la más nueva a la más antigua', async () => {
    await preparar(true);
    const tabla = await screen.findByRole('table', { name: 'Lista de ventas del turno' });
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent('N° 2');
    expect(filas[0]).toHaveTextContent('Débito');
    expect(filas[1]).toHaveTextContent('N° 1');
  });

  it('el dueño devuelve una unidad de una venta', async () => {
    const { u, alCambiar } = await preparar(true);
    await u.click(await screen.findByRole('button', { name: /N° 1/ }));
    const ventana = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    await u.click(within(ventana).getByRole('button', { name: 'Devolver productos' }));
    await u.click(within(ventana).getByRole('button', { name: /Una más de/ }));
    expect(within(ventana).getByRole('status', { name: /A devolver de/ })).toHaveTextContent('1');
    await u.type(within(ventana).getByLabelText('Motivo de la devolución'), 'Venía abollada');
    await u.click(within(ventana).getByRole('button', { name: 'Confirmar devolución' }));
    expect(await within(ventana).findByText(/Devolución registrada/)).toBeInTheDocument();
    expect(within(ventana).getByText(/Entrega \$1\.890 en efectivo/)).toBeInTheDocument();
    expect(alCambiar).toHaveBeenCalled();
    await waitFor(() => {
      expect(within(ventana).getByText(/devuelto 1/)).toBeInTheDocument();
    });
  });

  it('el cajero necesita la clave del dueño y no puede pasarse de lo vendido', async () => {
    const { u } = await preparar(false);
    await u.click(await screen.findByRole('button', { name: /N° 1/ }));
    const ventana = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    await u.click(within(ventana).getByRole('button', { name: 'Devolver productos' }));
    await u.click(within(ventana).getByRole('button', { name: 'Confirmar devolución' }));
    expect(within(ventana).getByRole('alert')).toHaveTextContent(
      'Elige qué productos se devuelven',
    );

    const mas = within(ventana).getByRole('button', { name: /Una más de/ });
    await u.click(mas);
    await u.click(mas);
    await u.click(mas); // tope: se vendieron 2
    expect(within(ventana).getByRole('status', { name: /A devolver de/ })).toHaveTextContent('2');

    await u.type(within(ventana).getByLabelText('Motivo de la devolución'), 'Cambio');
    await u.click(within(ventana).getByRole('button', { name: 'Confirmar devolución' }));
    expect(within(ventana).getByRole('alert')).toHaveTextContent('Se necesita la clave del dueño');
    await u.type(within(ventana).getByLabelText('Clave del dueño'), '1234');
    await u.click(within(ventana).getByRole('button', { name: 'Confirmar devolución' }));
    expect(await within(ventana).findByText(/Devolución registrada/)).toBeInTheDocument();
    // Ya no queda nada por devolver ni se puede anular entera.
    expect(within(ventana).queryByRole('button', { name: 'Devolver productos' })).toBeNull();
    expect(within(ventana).queryByRole('button', { name: 'Anular venta' })).toBeNull();
  });

  it('reimprime y anula desde el detalle', async () => {
    const { u, s } = await preparar(true);
    await u.click(await screen.findByRole('button', { name: /N° 2/ }));
    const ventana = await screen.findByRole('dialog', { name: 'Venta N° 2' });
    await u.click(within(ventana).getByRole('button', { name: 'Reimprimir' }));
    await waitFor(() => {
      expect(s.estado.impresiones.at(-1)).toMatchObject({ reimpresion: true });
    });
    await u.click(within(ventana).getByRole('button', { name: 'Anular venta' }));
    await u.click(within(ventana).getByRole('button', { name: 'Sí, anular venta' }));
    expect(within(ventana).getByRole('alert')).toHaveTextContent('Escribe el motivo');
    await u.type(within(ventana).getByLabelText('Motivo de la anulación'), 'Error de cobro');
    await u.click(within(ventana).getByRole('button', { name: 'Sí, anular venta' }));
    expect(await within(ventana).findByText(/Venta anulada/)).toBeInTheDocument();
    expect(within(ventana).getByText(/máquina de tarjetas/)).toBeInTheDocument();
  });
});
