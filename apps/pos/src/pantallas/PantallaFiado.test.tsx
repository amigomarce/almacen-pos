import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaFiado } from './PantallaFiado.js';

const vecino = (id: string, nombre: string, saldoClp: number) => ({
  id,
  nombre,
  telefono: null,
  nota: null,
  limiteClp: null,
  activo: true,
  saldoClp,
  ultimoMovimiento: null,
});

function montar(
  esDueno: boolean,
  clientes = [vecino('c1', 'Ana', 1500), vecino('c2', 'Beto', 8000)],
) {
  const s = servidorConSesion({ clientes });
  const dueno = s.estado.usuarios.find((x) => x.role === 'DUENO');
  if (esDueno && dueno) s.estado.tokens.set('t-prueba', dueno);
  const u = userEvent.setup();
  render(<PantallaFiado api={s.api} esDueno={esDueno} />);
  return { s, u };
}

describe('pestaña Fiado', () => {
  it('lista los vecinos del que más debe al que menos, con el total fiado', async () => {
    montar(false);
    const tabla = await screen.findByRole('table', { name: 'Vecinos con cuenta' });
    expect(
      within(tabla)
        .getAllByRole('row')
        .map((f) => f.textContent),
    ).toEqual(['Beto$8.000', 'Ana$1.500']);
    expect(screen.getByLabelText('Total fiado')).toHaveTextContent('$9.500');
    expect(screen.queryByRole('button', { name: 'Nuevo vecino' })).not.toBeInTheDocument();
  });

  it('el cajero recibe un abono y se imprime el recibo', async () => {
    const { s, u } = montar(false);
    await u.click(await screen.findByRole('button', { name: 'Beto' }));
    expect(await screen.findByLabelText('Saldo del vecino')).toHaveTextContent('Debe $8.000');
    await u.type(screen.getByLabelText('Monto del abono'), '3000');
    await u.click(screen.getByRole('button', { name: 'Registrar abono' }));
    expect(await screen.findByText(/Abono de \$3\.000 registrado/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Saldo del vecino')).toHaveTextContent('Debe $5.000');
    });
    expect(s.estado.clientes.find((c) => c.id === 'c2')?.saldoClp).toBe(5000);
    expect(screen.getByRole('table', { name: 'Movimientos de la cuenta' })).toHaveTextContent(
      'Abono',
    );
    expect(screen.queryByRole('heading', { name: 'Ajuste de cuenta' })).not.toBeInTheDocument();
  });

  it('el dueño crea un vecino y ajusta una cuenta', async () => {
    const { s, u } = montar(true, []);
    expect(await screen.findByText(/Crea el primero/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Nuevo vecino' }));
    await u.type(screen.getByLabelText('Nombre'), 'Rosa');
    await u.type(screen.getByLabelText(/Límite de deuda/), '20000');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('heading', { name: 'Rosa' })).toBeInTheDocument();
    expect(s.estado.clientes[0]).toMatchObject({ nombre: 'Rosa', limiteClp: 20000 });

    await u.click(screen.getByRole('radio', { name: 'Sube la deuda' }));
    await u.type(screen.getByLabelText('Monto del ajuste'), '500');
    await u.type(screen.getByLabelText('Motivo del ajuste'), 'Deuda anterior en el cuaderno');
    await u.click(screen.getByRole('button', { name: 'Registrar ajuste' }));
    expect(await screen.findByText(/Ajuste registrado. Debe \$500/)).toBeInTheDocument();
  });
});
