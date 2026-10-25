import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaVenta } from './PantallaVenta.js';

async function montar(...args: Parameters<typeof servidorConSesion>) {
  const s = servidorConSesion(...args);
  const u = userEvent.setup();
  render(<PantallaVenta api={s.api} />);
  const campo = screen.getByLabelText('Escanea o escribe un código');
  const escanear = (codigo: string) => u.type(campo, `${codigo}{Enter}`);
  const total = () => screen.getByLabelText('Total');
  /** Escanea y espera a que el servidor haya cotizado ese total. */
  const listo = async (codigo: string, totalEsperado: string) => {
    await escanear(codigo);
    await waitFor(() => expect(total()).toHaveTextContent(totalEsperado));
  };
  await waitFor(() => {
    expect(s.fetchFn).toHaveBeenCalledWith('/api/settings', expect.anything());
  });
  return { s, u, campo, escanear, listo };
}

const ventana = (nombre: string | RegExp) => screen.getByRole('dialog', { name: nombre });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('cobro', () => {
  it('efectivo exacto en 3 acciones: escanear → F12 → Enter', async () => {
    const { s, u, campo, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}');
    expect(within(ventana('Cobrar')).getByLabelText('Total a pagar')).toHaveTextContent('$1.890');
    expect(within(ventana('Cobrar')).getByLabelText('Paga con')).toHaveTextContent('Exacto');
    await u.keyboard('{Enter}');

    const lista = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    expect(within(lista).getByLabelText('Vuelto')).toHaveTextContent('$0');
    expect(s.estado.pedidos[0]).toMatchObject({
      medioPago: 'EFECTIVO',
      pagadoClp: 1890,
      totalEsperadoClp: 1890,
      lineas: [{ productoId: 'p1', cantidadMilli: 1000 }],
    });
    expect(await within(lista).findByText('Comprobante impreso.')).toBeInTheDocument();
    expect(s.estado.impresiones).toEqual([{ id: s.estado.pedidos[0]?.['id'], reimpresion: false }]);
    // La venta quedó lista: la pantalla está vacía para el siguiente cliente.
    expect(screen.getByText('Escanea un producto para empezar')).toBeInTheDocument();
    await esperar(750);
    await u.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it('redondeo de efectivo, "paga con" y vuelto', async () => {
    const { s, u, escanear } = await montar();
    await u.click(await screen.findByRole('button', { name: /Pan/ }));
    await u.keyboard('{Tab}1863{Enter}'); // $1.863 de pan
    await escanear('');
    await waitFor(() => expect(screen.getByLabelText('Total')).toHaveTextContent('$1.863'));
    await u.keyboard('{F12}');
    const cobro = ventana('Cobrar');
    expect(within(cobro).getByLabelText('Total a pagar')).toHaveTextContent('$1.860');
    expect(within(cobro).getByText('Venta $1.863 · redondeo efectivo -$3')).toBeInTheDocument();
    await u.keyboard('2000');
    expect(within(cobro).getByLabelText('Vuelto')).toHaveTextContent('$140');
    await u.keyboard('{Enter}');
    expect(
      within(await screen.findByRole('dialog', { name: 'Venta N° 1' })).getByLabelText('Vuelto'),
    ).toHaveTextContent('$140');
    expect(s.estado.pedidos[0]).toMatchObject({ pagadoClp: 2000 });
  });

  it('sin redondeo si el local lo desactivó', async () => {
    const { u, listo } = await montar({ redondeo: false });
    await u.click(await screen.findByRole('button', { name: /Pan/ }));
    await u.keyboard('{Tab}1863{Enter}');
    await listo('', '$1.863');
    await u.keyboard('{F12}');
    expect(within(ventana('Cobrar')).getByLabelText('Total a pagar')).toHaveTextContent('$1.863');
  });

  it('no cobra si falta dinero', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}1000{Enter}');
    const cobro = ventana('Cobrar');
    expect(within(cobro).getByLabelText('Vuelto')).toHaveTextContent('Faltan $890');
    expect(
      within(cobro).getByText('Falta dinero: el cliente debe pagar $1.890'),
    ).toBeInTheDocument();
    expect(s.estado.pedidos).toHaveLength(0);
  });

  it('billetes rápidos: un toque cobra con ese billete', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.click(screen.getByRole('button', { name: 'Cobrar (F12)' }));
    const cobro = ventana('Cobrar');
    expect(within(cobro).queryByRole('button', { name: '$1.000' })).not.toBeInTheDocument();
    await u.click(within(cobro).getByRole('button', { name: '$5.000' }));
    expect(
      within(await screen.findByRole('dialog', { name: 'Venta N° 1' })).getByLabelText('Vuelto'),
    ).toHaveTextContent('$3.110');
    expect(s.estado.pedidos[0]).toMatchObject({ pagadoClp: 5000 });
  });

  it('débito: se cobra en la máquina y se confirma; el voucher es la boleta', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}d');
    const cobro = ventana('Cobrar');
    expect(within(cobro).getByRole('button', { name: /Débito/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(cobro).getByText('Cobra $1.890 en la máquina de tarjetas')).toBeInTheDocument();
    await u.keyboard('{Enter}');
    const lista = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    expect(
      within(lista).getByText('La boleta es el voucher de la máquina de tarjetas.'),
    ).toBeInTheDocument();
    expect(s.estado.pedidos[0]).toMatchObject({ medioPago: 'DEBITO' });
    expect(s.estado.pedidos[0]).not.toHaveProperty('pagadoClp');
  });

  it('transferencia y crédito muestran su instrucción', async () => {
    const { u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}t');
    expect(
      within(ventana('Cobrar')).getByText('Confirma que llegó la transferencia de $1.890'),
    ).toBeInTheDocument();
    await u.click(within(ventana('Cobrar')).getByRole('button', { name: /Crédito/ }));
    expect(
      within(ventana('Cobrar')).getByText('Cobra $1.890 en la máquina de tarjetas'),
    ).toBeInTheDocument();
    await u.keyboard('e');
    expect(within(ventana('Cobrar')).getByLabelText('Paga con')).toBeInTheDocument();
  });

  it('PUENTE_MANUAL: indica emitir en e-Boleta y guarda el folio opcional', async () => {
    const { u, listo } = await montar({ dteProvider: 'PUENTE_MANUAL' });
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Enter}');
    const lista = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    expect(within(lista).getByRole('note')).toHaveTextContent(
      'Emite la boleta en la app e-Boleta del SII por $1.890',
    );
    await u.type(within(lista).getByLabelText('Folio SII (opcional)'), 'a0012{Enter}');
    expect(await within(lista).findByText('12')).toBeInTheDocument();
    expect(within(lista).getByText(/Folio e-Boleta registrado/)).toBeInTheDocument();
  });

  it('muestra el error del folio', async () => {
    const { s, u, listo } = await montar({ dteProvider: 'PUENTE_MANUAL' });
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Enter}');
    const lista = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    await u.type(within(lista).getByLabelText('Folio SII (opcional)'), '0');
    await u.click(within(lista).getByRole('button', { name: 'Guardar folio' }));
    expect(
      await within(lista).findByText('El folio debe ser un número mayor a 0'),
    ).toBeInTheDocument();
    expect(s.estado.ventas.size).toBe(1);
  });

  it('si los precios cambiaron, vuelve a la venta con el aviso', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    s.estado.forzar['POST /sales'] = {
      status: 409,
      body: { error: 'TOTAL_CAMBIO', mensaje: 'Los precios cambiaron: el total ahora es $1.990' },
    };
    await u.keyboard('{F12}{Enter}');
    expect(
      await screen.findByText(
        'Los precios cambiaron: el total ahora es $1.990. Revisa y cobra de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('sin conexión: avisa que no se guardó y reintentar usa el mismo id (no duplica)', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    s.fetchFn.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    await u.keyboard('{F12}{Enter}');
    expect(
      await within(ventana('Cobrar')).findByText(/La venta no se guardó: reintenta/),
    ).toBeInTheDocument();
    await u.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Venta N° 1' });
    expect(s.estado.pedidos).toHaveLength(1);
  });

  it('impresora caída: muestra el error y deja ver el comprobante en pantalla', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Enter}');
    const lista = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    await within(lista).findByText('Comprobante impreso.');
    const id = String(s.estado.pedidos[0]?.['id']);
    s.estado.forzar[`POST /sales/${id}/print`] = {
      status: 503,
      body: {
        error: 'IMPRESORA_NO_RESPONDE',
        mensaje: 'La impresora no responde',
        vistaPrevia: 'TICKET DE PRUEBA',
      },
    };
    await u.click(within(lista).getByRole('button', { name: 'Imprimir de nuevo' }));
    expect(await within(lista).findByText('La impresora no responde')).toBeInTheDocument();
    await u.click(within(lista).getByRole('button', { name: 'Ver comprobante' }));
    expect(within(lista).getByLabelText('Comprobante')).toHaveTextContent('TICKET DE PRUEBA');
    expect(s.estado.impresiones).toHaveLength(1);
  });

  it('sin impresora: lo dice, y reimprimir marca la reimpresión', async () => {
    const { s, u, listo } = await montar({ impresora: false });
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Enter}');
    const lista = await screen.findByRole('dialog', { name: 'Venta N° 1' });
    expect(await within(lista).findByText('No hay impresora configurada.')).toBeInTheDocument();
    await u.click(within(lista).getByRole('button', { name: 'Ver comprobante' }));
    expect(within(lista).getByLabelText('Comprobante')).toHaveTextContent('NO VÁLIDO COMO BOLETA');
    await u.click(within(lista).getByRole('button', { name: 'Ocultar comprobante' }));
    await u.click(within(lista).getByRole('button', { name: 'Imprimir de nuevo' }));
    await waitFor(() => {
      expect(s.estado.impresiones[1]).toMatchObject({ reimpresion: true });
    });
  });

  it('un Enter repetido no cierra el vuelto antes de tiempo', async () => {
    const { u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Enter}');
    await screen.findByRole('dialog', { name: 'Venta N° 1' });
    await u.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Venta N° 1' })).toBeInTheDocument();
  });

  it('escanear con el vuelto en pantalla empieza la venta siguiente', async () => {
    const { u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Enter}');
    await screen.findByRole('dialog', { name: 'Venta N° 1' });
    act(() => {
      for (const key of [...Array.from('78040000'), 'Enter'])
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Galletas de vino');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cobrar está desactivado sin productos y Esc cierra el cobro', async () => {
    const { u, listo } = await montar();
    expect(screen.getByRole('button', { name: 'Cobrar (F12)' })).toBeDisabled();
    await u.keyboard('{F12}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('un vuelto muy grande (cero de más) pide confirmar con otro Enter', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}200000{Enter}');
    expect(within(ventana('Cobrar')).getByRole('alert')).toHaveTextContent(
      '¿Seguro? El vuelto sería $198.110',
    );
    expect(s.estado.pedidos).toHaveLength(0);
    await u.keyboard('{Backspace}{Enter}'); // corrige a $20.000
    expect(
      within(await screen.findByRole('dialog', { name: 'Venta N° 1' })).getByLabelText('Vuelto'),
    ).toHaveTextContent('$18.110');
  });

  it('confirmado el vuelto grande, cobra', async () => {
    const { s, u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.keyboard('{F12}200000{Enter}{Enter}');
    await screen.findByRole('dialog', { name: 'Venta N° 1' });
    expect(s.estado.pedidos[0]).toMatchObject({ pagadoClp: 200000 });
  });

  it('al abrir el cobro el foco queda dentro de la ventana', async () => {
    const { u, listo } = await montar();
    await listo('7801', '$1.890');
    await u.click(screen.getByRole('button', { name: 'Cobrar (F12)' }));
    expect(ventana('Cobrar')).toHaveFocus();
  });

  it('F12 justo después de escanear espera el total del servidor y abre el cobro', async () => {
    const { s, u, escanear } = await montar();
    const original = s.fetchFn.getMockImplementation();
    if (!original) throw new Error('sin implementación');
    s.fetchFn.mockImplementation((url, init) =>
      typeof url === 'string' && url.includes('/sales/quote')
        ? new Promise((r) =>
            setTimeout(() => {
              r(original(url, init));
            }, 150),
          )
        : original(url, init),
    );
    await escanear('7801');
    await u.keyboard('{F12}');
    expect(screen.getByRole('alert')).toHaveTextContent('Calculando el total…');
    expect(await screen.findByRole('dialog', { name: 'Cobrar' })).toBeInTheDocument();
    expect(within(ventana('Cobrar')).getByLabelText('Total a pagar')).toHaveTextContent('$1.890');
  });

  it('F12 mientras el código escaneado todavía se está buscando también espera', async () => {
    const { s, u, campo } = await montar();
    const original = s.fetchFn.getMockImplementation();
    if (!original) throw new Error('sin implementación');
    s.fetchFn.mockImplementation((url, init) =>
      typeof url === 'string' && url.includes('/products/lookup/')
        ? new Promise((r) =>
            setTimeout(() => {
              r(original(url, init));
            }, 150),
          )
        : original(url, init),
    );
    await u.type(campo, '7801{Enter}');
    await u.keyboard('{F12}');
    expect(await screen.findByRole('dialog', { name: 'Cobrar' })).toBeInTheDocument();
    // Un código que no existe cancela la espera.
    await u.keyboard('{Escape}');
    await u.type(campo, '999999{Enter}');
    await u.keyboard('{F12}');
    expect(await screen.findByText('El código 999999 no está registrado.')).toBeInTheDocument();
  });
});
