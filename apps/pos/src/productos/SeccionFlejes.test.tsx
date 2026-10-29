import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servidorConSesion } from '../test/servidorFalso.js';
import { SeccionFlejes } from './SeccionFlejes.js';

const flejes = [
  {
    id: 'p1',
    nombre: 'Bebida cola 1,5 L',
    marca: 'Cola',
    formato: '1,5 L',
    unidad: 'UN' as const,
    codigo: '7801',
    precioClp: 1990,
    precioEtiquetaClp: 1890,
  },
  {
    id: 'p2',
    nombre: 'Queso laminado',
    marca: null,
    formato: null,
    unidad: 'KG' as const,
    codigo: null,
    precioClp: 11990,
    precioEtiquetaClp: null,
  },
];

describe('etiquetas de precio por cambiar', () => {
  it('sin pendientes no muestra nada', async () => {
    const s = servidorConSesion();
    const { container } = render(<SeccionFlejes api={s.api} />);
    await waitFor(() => {
      expect(s.fetchFn).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('lista los pendientes con el precio viejo y el nuevo, e imprime los elegidos', async () => {
    const s = servidorConSesion({ flejes: [...flejes], impresora: true });
    const u = userEvent.setup();
    render(<SeccionFlejes api={s.api} />);
    expect(
      await screen.findByRole('heading', { name: 'Etiquetas de precio por cambiar (2)' }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Ver' }));
    const tabla = screen.getByRole('table', { name: 'Etiquetas por cambiar' });
    expect(within(tabla).getByText('$1.890')).toHaveClass('tachado');
    expect(within(tabla).getByText('$11.990/kg')).toBeInTheDocument();

    await u.click(within(tabla).getByRole('checkbox', { name: /Queso laminado/ }));
    await u.click(screen.getByRole('button', { name: 'Imprimir etiquetas (1)' }));
    expect(await screen.findByText('1 etiqueta impresa.')).toBeInTheDocument();
    expect(s.estado.flejes.map((f) => f.id)).toEqual(['p2']);
    expect(
      await screen.findByRole('heading', { name: 'Etiquetas de precio por cambiar (1)' }),
    ).toBeInTheDocument();
  });

  it('sin impresora muestra la vista previa; "ya las cambié" las saca de la lista', async () => {
    const s = servidorConSesion({ flejes: [...flejes], impresora: false });
    const u = userEvent.setup();
    render(<SeccionFlejes api={s.api} />);
    await u.click(await screen.findByRole('button', { name: 'Ver' }));
    await u.click(screen.getByRole('button', { name: 'Imprimir etiquetas (2)' }));
    expect(await screen.findByLabelText('Vista previa de las etiquetas')).toHaveTextContent(
      'Bebida cola 1,5 L',
    );
    await u.click(screen.getByRole('button', { name: 'Ya las cambié a mano' }));
    await waitFor(() => {
      expect(s.estado.flejes).toEqual([]);
    });
  });
});
