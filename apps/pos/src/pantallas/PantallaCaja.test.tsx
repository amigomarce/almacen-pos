import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaCaja } from './PantallaCaja.js';

const sesion = {
  id: 's1',
  abiertaPor: { id: 'u2', name: 'Cajero' },
  abiertaEn: '',
  efectivoInicialClp: 10000,
};

/** Registra ventas directo en el servidor falso. */
async function vender(
  s: ReturnType<typeof servidorConSesion>,
  medioPago: string,
  pagadoClp?: number,
) {
  await s.api.registrarVenta({
    id: crypto.randomUUID(),
    lineas: [{ productoId: 'p1', cantidadMilli: 1000 }],
    medioPago: medioPago as 'EFECTIVO',
    ...(pagadoClp ? { pagadoClp } : {}),
  });
}

function montar(esDueno: boolean, ...args: Parameters<typeof servidorConSesion>) {
  const s = servidorConSesion(...args);
  const u = userEvent.setup();
  const alCambiarCaja = vi.fn();
  render(<PantallaCaja api={s.api} esDueno={esDueno} alCambiarCaja={alCambiarCaja} />);
  return { s, u, alCambiarCaja };
}

describe('pantalla de caja', () => {
  it('con la caja cerrada lo indica', async () => {
    montar(false);
    expect(
      await screen.findByText('La caja está cerrada. Ábrela desde la pestaña Venta.'),
    ).toBeInTheDocument();
  });

  it('muestra el resumen del turno y cierra con la diferencia', async () => {
    const s = servidorConSesion({ sesionCaja: { ...sesion } });
    await vender(s, 'EFECTIVO');
    await vender(s, 'DEBITO');
    const u = userEvent.setup();
    const alCambiarCaja = vi.fn();
    render(<PantallaCaja api={s.api} esDueno={false} alCambiarCaja={alCambiarCaja} />);

    const tabla = await screen.findByRole('table', { name: 'Ventas del turno' });
    expect(tabla).toHaveTextContent('Efectivo (1)$1.890');
    expect(tabla).toHaveTextContent('Débito (1)$1.890');
    expect(tabla).toHaveTextContent('Total cobrado (2 ventas)$3.780');
    expect(tabla).toHaveTextContent('Efectivo esperado en caja$11.890');

    await u.type(screen.getByLabelText('Efectivo contado'), '11500');
    expect(screen.getByLabelText('Diferencia al cerrar')).toHaveTextContent('Faltan $390');
    await u.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await u.click(screen.getByRole('button', { name: 'Sí, cerrar caja' }));

    expect(await screen.findByRole('heading', { name: 'Caja cerrada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Diferencia')).toHaveTextContent('Faltan $390');
    expect(await screen.findByText('Cierre impreso.')).toBeInTheDocument();
    expect(s.estado.cierres).toEqual([{ efectivoContadoClp: 11500 }]);
    await u.click(screen.getByRole('button', { name: 'Listo' }));
    expect(alCambiarCaja).toHaveBeenCalledWith({
      caja: { id: 'c1', name: 'Caja 1' },
      sesion: null,
    });
  });

  it('el cierre pide confirmar y se puede arrepentir', async () => {
    const { s, u } = montar(false, { sesionCaja: { ...sesion } });
    await u.type(await screen.findByLabelText('Efectivo contado'), '10000');
    expect(screen.getByLabelText('Diferencia al cerrar')).toHaveTextContent('Cuadra');
    await u.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    await u.click(screen.getByRole('button', { name: 'No' }));
    expect(s.estado.cierres).toHaveLength(0);
  });

  it('el cajero anula la última venta con la clave del dueño y ve el recordatorio', async () => {
    const s = servidorConSesion({ sesionCaja: { ...sesion } });
    await vender(s, 'DEBITO');
    const u = userEvent.setup();
    render(<PantallaCaja api={s.api} esDueno={false} alCambiarCaja={vi.fn()} />);
    await u.click(await screen.findByRole('button', { name: 'Ver última venta' }));
    expect(await screen.findByLabelText('Última venta')).toHaveTextContent(
      'Venta N° 1 · $1.890 · Débito · Cajero',
    );
    await u.click(screen.getByRole('button', { name: 'Anular venta' }));
    await u.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(screen.getByText('Escribe el motivo de la anulación')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Motivo'), 'Cliente se arrepintió');
    await u.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(screen.getByText('Para anular se necesita la clave del dueño')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Clave del dueño'), '9999');
    await u.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(await screen.findByText('Clave del dueño incorrecta')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Clave del dueño'), '1234');
    await u.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(await screen.findByText('Venta anulada. El stock fue devuelto.')).toBeInTheDocument();
    expect(screen.getByLabelText('Última venta')).toHaveTextContent('ANULADA');
    expect(screen.getByRole('note')).toHaveTextContent(
      'Anula también el pago en la máquina de tarjetas',
    );
    expect(s.estado.anulaciones.at(-1)).toEqual({
      motivo: 'Cliente se arrepintió',
      pinDueno: '1234',
    });
    await waitFor(() =>
      expect(screen.getByRole('table', { name: 'Ventas del turno' })).toHaveTextContent(
        'Anuladas (1)$1.890',
      ),
    );
  });

  it('al dueño le muestra los cierres inesperados del turno', async () => {
    const conCierres = {
      ...sesion,
      cierresInesperados: { cantidad: 2, ultimo: '2026-10-29T15:30:00.000Z' },
    };
    montar(true, { sesionCaja: conCierres });
    expect(await screen.findByRole('note', { name: 'Cierres inesperados' })).toHaveTextContent(
      'La caja se cerró sin hacer el cierre de caja (cierre forzado o corte de luz) 2 veces',
    );
  });

  it('el cajero no ve el aviso de cierres inesperados', async () => {
    montar(false, {
      sesionCaja: { ...sesion, cierresInesperados: { cantidad: 1, ultimo: null } },
    });
    expect(await screen.findByRole('heading', { name: /Turno de/ })).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Cierres inesperados' })).not.toBeInTheDocument();
  });

  it('sin ventas en el turno lo dice', async () => {
    const vacio = montar(true, { sesionCaja: { ...sesion } });
    await vacio.u.click(await screen.findByRole('button', { name: 'Ver última venta' }));
    expect(await screen.findByText('No hay ventas en este turno.')).toBeInTheDocument();
  });

  it('el dueño anula sin pedir clave y puede reimprimir', async () => {
    const s = servidorConSesion({ sesionCaja: { ...sesion } });
    const dueno = s.estado.usuarios.find((x) => x.role === 'DUENO');
    if (dueno) s.estado.tokens.set('t-prueba', dueno);
    await vender(s, 'EFECTIVO');
    const u = userEvent.setup();
    render(<PantallaCaja api={s.api} esDueno alCambiarCaja={vi.fn()} />);
    await u.click(await screen.findByRole('button', { name: 'Ver última venta' }));
    await u.click(await screen.findByRole('button', { name: 'Reimprimir' }));
    expect(await screen.findByText('Comprobante reimpreso.')).toBeInTheDocument();
    expect(s.estado.impresiones.at(-1)).toMatchObject({ reimpresion: true });
    await u.click(screen.getByRole('button', { name: 'Anular venta' }));
    expect(screen.queryByLabelText('Clave del dueño')).not.toBeInTheDocument();
    await u.type(screen.getByLabelText('Motivo'), 'Error de digitación');
    await u.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    expect(await screen.findByText('Venta anulada. El stock fue devuelto.')).toBeInTheDocument();
    expect(s.estado.anulaciones.at(-1)).toEqual({ motivo: 'Error de digitación' });
    expect(within(screen.getByLabelText('Última venta')).getByText(/ANULADA/)).toBeInTheDocument();
  });
});
