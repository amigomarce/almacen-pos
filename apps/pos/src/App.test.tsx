import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { ClienteApi, ErrorApi, MENSAJE_SIN_CONEXION, type EstadoServidor } from './api.js';

const estadoOk: EstadoServidor = {
  status: 'ok',
  version: '0.1.0',
  db: 'ok',
  semilla: true,
  hora: '2026-10-25T12:00:00.000Z',
};

function clienteCon(estado: () => Promise<EstadoServidor>): ClienteApi {
  const cliente = new ClienteApi('/api', vi.fn<typeof fetch>());
  vi.spyOn(cliente, 'estado').mockImplementation(estado);
  return cliente;
}

describe('App', () => {
  it('muestra que el servidor está conectado', async () => {
    render(<App api={clienteCon(() => Promise.resolve(estadoOk))} />);
    expect(screen.getByRole('heading', { name: 'Almacén POS' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Servidor conectado · v0.1.0');
  });

  it('avisa si el servidor no tiene base de productos', async () => {
    render(<App api={clienteCon(() => Promise.resolve({ ...estadoOk, semilla: false }))} />);
    expect(await screen.findByRole('status')).toHaveTextContent('sin base de productos');
  });

  it('avisa cuando no hay conexión con el servidor', async () => {
    const sinConexion = new ErrorApi(0, 'SIN_CONEXION', MENSAJE_SIN_CONEXION);
    render(<App api={clienteCon(() => Promise.reject(sinConexion))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_SIN_CONEXION);
  });
});
