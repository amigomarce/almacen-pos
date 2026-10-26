import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ErrorApi,
  type CambiosConfiguracion,
  type ClienteApi,
  type ConfiguracionLocal,
  type Usuario,
} from '../api.js';
import { ModalBoletaInicial } from './ModalBoletaInicial.js';

const DUENO: Usuario = { id: 'u1', name: 'Dueño', role: 'DUENO' };
const CAJERO: Usuario = { id: 'u2', name: 'Cajero', role: 'CAJERO' };

function config(extras: Partial<ConfiguracionLocal> = {}): ConfiguracionLocal {
  return {
    razonSocial: 'Almacén de Prueba',
    dteProvider: 'PUENTE_MANUAL',
    boletaConfirmada: false,
    modoPrueba: false,
    modeloEmision: 'SOLO_NO_ELECTRONICOS',
    cashRoundingEnabled: true,
    modalidadesDisponibles: ['PUENTE_MANUAL', 'MOCK'],
    ...extras,
  };
}

function apiCon(guardar: (c: CambiosConfiguracion) => Promise<ConfiguracionLocal>): ClienteApi {
  return { guardarConfiguracion: guardar } as unknown as ClienteApi;
}

describe('ModalBoletaInicial', () => {
  it('preselecciona la app del SII y deshabilita emitir desde la caja sin certificado', () => {
    render(
      <ModalBoletaInicial
        api={apiCon(() => Promise.reject(new Error('no')))}
        config={config()}
        usuario={DUENO}
        alConfirmar={vi.fn()}
        alSalir={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '¿Cómo emitirá las boletas?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Con la app del SII/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Desde esta caja/ })).toBeDisabled();
    expect(screen.getByText(/falta cargar el certificado digital/i)).toBeInTheDocument();
  });

  it('con datos de certificación explica que falta terminar la certificación', () => {
    render(
      <ModalBoletaInicial
        api={apiCon(() => Promise.reject(new Error('no')))}
        config={config({ siiListo: true, siiAmbiente: 'certificacion' })}
        usuario={DUENO}
        alConfirmar={vi.fn()}
        alSalir={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: /Desde esta caja/ })).toBeDisabled();
    expect(screen.getByText(/falta terminar la certificación ante el SII/i)).toBeInTheDocument();
  });

  it('permite elegir emitir desde la caja y guarda la modalidad', async () => {
    const u = userEvent.setup();
    const alConfirmar = vi.fn();
    const guardar = vi.fn((c: CambiosConfiguracion) =>
      Promise.resolve(
        config({ dteProvider: c.dteProvider ?? 'PUENTE_MANUAL', boletaConfirmada: true }),
      ),
    );
    render(
      <ModalBoletaInicial
        api={apiCon(guardar)}
        config={config({
          modalidadesDisponibles: ['PUENTE_MANUAL', 'SII_DIRECTO'],
          siiListo: true,
        })}
        usuario={DUENO}
        alConfirmar={alConfirmar}
        alSalir={vi.fn()}
      />,
    );

    const sii = screen.getByRole('radio', { name: /Desde esta caja/ });
    expect(sii).toBeEnabled();
    await u.click(sii);
    await u.click(screen.getByRole('button', { name: 'Confirmar y vender' }));

    expect(guardar).toHaveBeenCalledWith({ dteProvider: 'SII_DIRECTO' });
    expect(alConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ dteProvider: 'SII_DIRECTO', boletaConfirmada: true }),
    );
  });

  it('muestra el error del servidor y no confirma', async () => {
    const u = userEvent.setup();
    const alConfirmar = vi.fn();
    render(
      <ModalBoletaInicial
        api={apiCon(() =>
          Promise.reject(new ErrorApi(400, 'SII_NO_CONFIGURADO', 'Falta el certificado')),
        )}
        config={config()}
        usuario={DUENO}
        alConfirmar={alConfirmar}
        alSalir={vi.fn()}
      />,
    );
    await u.click(screen.getByRole('button', { name: 'Confirmar y vender' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta el certificado');
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it('al cajero le pide que llame al dueño', () => {
    render(
      <ModalBoletaInicial
        api={apiCon(() => Promise.reject(new Error('no')))}
        config={config()}
        usuario={CAJERO}
        alConfirmar={vi.fn()}
        alSalir={vi.fn()}
      />,
    );
    expect(screen.getByText(/El dueño debe elegir/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
