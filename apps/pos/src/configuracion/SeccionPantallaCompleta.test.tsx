import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PantallaCompleta } from '../kiosco.js';
import { SeccionPantallaCompleta } from './SeccionPantallaCompleta.js';

function pantallaFalsa(activa = true, falla = false): PantallaCompleta & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    disponible: true,
    activa: vi.fn(() => Promise.resolve(activa)),
    salir: vi.fn(() => {
      llamadas.push('salir');
      return falla ? Promise.reject(new Error('x')) : Promise.resolve();
    }),
    entrar: vi.fn(() => {
      llamadas.push('entrar');
      return Promise.resolve();
    }),
  };
}

describe('Configuración → Pantalla completa', () => {
  it('es la única salida: el dueño sale y puede volver', async () => {
    const u = userEvent.setup();
    const pantalla = pantallaFalsa();
    render(<SeccionPantallaCompleta pantalla={pantalla} />);

    expect(screen.getByText(/Este botón es la única forma de salir/)).toBeInTheDocument();
    const salir = await screen.findByRole('button', { name: 'Salir de pantalla completa' });
    await vi.waitFor(() => {
      expect(salir).toBeEnabled();
    });
    await u.click(salir);
    const volver = await screen.findByRole('button', { name: 'Volver a pantalla completa' });
    await u.click(volver);
    expect(await screen.findByRole('button', { name: 'Salir de pantalla completa' })).toBeVisible();
    expect(pantalla.llamadas).toEqual(['salir', 'entrar']);
  });

  it('con la caja abierta no se puede salir', async () => {
    render(<SeccionPantallaCompleta pantalla={pantallaFalsa()} cajaAbierta />);
    const salir = await screen.findByRole('button', { name: 'Salir de pantalla completa' });
    await vi.waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('primero haz el cierre de caja');
    });
    expect(salir).toBeDisabled();
  });

  it('muestra el motivo que da la app de escritorio', async () => {
    const u = userEvent.setup();
    const pantalla = pantallaFalsa();
    pantalla.salir = () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Tauri rechaza con texto
      Promise.reject('La caja está abierta. Haz el cierre de caja antes.');
    render(<SeccionPantallaCompleta pantalla={pantalla} />);
    const salir = await screen.findByRole('button', { name: 'Salir de pantalla completa' });
    await vi.waitFor(() => {
      expect(salir).toBeEnabled();
    });
    await u.click(salir);
    expect(await screen.findByRole('alert')).toHaveTextContent('La caja está abierta');
  });

  it('muestra el error si no se puede salir', async () => {
    const u = userEvent.setup();
    render(<SeccionPantallaCompleta pantalla={pantallaFalsa(true, true)} />);
    const salir = await screen.findByRole('button', { name: 'Salir de pantalla completa' });
    await vi.waitFor(() => {
      expect(salir).toBeEnabled();
    });
    await u.click(salir);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cambiar la pantalla completa',
    );
  });

  it('en el navegador no aparece', () => {
    const { container } = render(
      <SeccionPantallaCompleta pantalla={{ ...pantallaFalsa(), disponible: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
