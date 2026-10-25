import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';
import { ClienteApi, MENSAJE_SIN_CONEXION } from './api.js';
import { guardarToken } from './sesion.js';
import { servidorFalso } from './test/servidorFalso.js';

afterEach(() => {
  guardarToken(null);
});

const teclear = async (u: ReturnType<typeof userEvent.setup>, digitos: string) => {
  for (const d of digitos) await u.click(screen.getByRole('button', { name: d }));
};

async function entrarComoCajero(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole('button', { name: /Cajero/ }));
  await teclear(u, '0000');
  await u.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('conexión y modo prueba', () => {
  it('muestra que el servidor está conectado', async () => {
    render(<App api={servidorFalso().api} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Servidor conectado · v0.1.0');
  });

  it('avisa cuando no hay conexión con el servidor', async () => {
    const api = new ClienteApi('/api', () => Promise.reject(new TypeError('Failed to fetch')));
    render(<App api={api} />);
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent)).toContain(
      MENSAJE_SIN_CONEXION,
    );
  });

  it('con MOCK muestra "MODO PRUEBA – no emite boletas" desde la pantalla de PIN', async () => {
    render(<App api={servidorFalso({ modoPrueba: true }).api} />);
    expect(await screen.findByRole('note', { name: 'Modo prueba' })).toHaveTextContent(
      'MODO PRUEBA – no emite boletas',
    );
    expect(screen.getByText('¿Quién atiende?')).toBeInTheDocument();
  });

  it('con PUENTE_MANUAL no muestra el aviso', async () => {
    render(<App api={servidorFalso().api} />);
    await screen.findByRole('status');
    expect(screen.queryByRole('note', { name: 'Modo prueba' })).not.toBeInTheDocument();
  });
});

describe('entrar con PIN', () => {
  it('elige usuario, ingresa el PIN, abre la caja y llega a la caja abierta', async () => {
    const u = userEvent.setup();
    const s = servidorFalso();
    render(<App api={s.api} />);
    await entrarComoCajero(u);

    expect(await screen.findByRole('heading', { name: 'Abrir Caja 1' })).toBeInTheDocument();
    expect(screen.getByText('Cajero · Caja 1')).toBeInTheDocument();
    await teclear(u, '012000');
    await u.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(screen.getByLabelText('Efectivo inicial')).toHaveTextContent('$1.200');
    await teclear(u, '0');
    expect(screen.getByLabelText('Efectivo inicial')).toHaveTextContent('$12.000');
    await u.click(screen.getByRole('button', { name: 'Abrir caja' }));

    expect(await screen.findByLabelText('Escanea o escribe un código')).toBeInTheDocument();
    expect(s.estado.sesionCaja?.efectivoInicialClp).toBe(12000);
  });

  it('funciona con el teclado físico', async () => {
    const u = userEvent.setup();
    const s = servidorFalso();
    render(<App api={s.api} />);
    await u.click(await screen.findByRole('button', { name: /Dueño/ }));
    await u.keyboard('12345{Backspace}{Enter}');
    expect(await screen.findByRole('heading', { name: 'Abrir Caja 1' })).toBeInTheDocument();
    await u.keyboard('5000{Enter}');
    expect(await screen.findByLabelText('Escanea o escribe un código')).toBeInTheDocument();
    expect(s.estado.sesionCaja?.efectivoInicialClp).toBe(5000);
  });

  it('no pierde dígitos si las teclas llegan en ráfaga (antes de redibujar)', async () => {
    const u = userEvent.setup();
    const s = servidorFalso();
    render(<App api={s.api} />);
    await u.click(await screen.findByRole('button', { name: /Cajero/ }));
    // Eventos nativos seguidos, sin esperar a React entre uno y otro.
    for (const key of ['0', '0', '0', '0', 'Enter'])
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(await screen.findByRole('heading', { name: 'Abrir Caja 1' })).toBeInTheDocument();
    for (const key of ['7', '5', '0', '0', 'Enter'])
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(await screen.findByLabelText('Escanea o escribe un código')).toBeInTheDocument();
    expect(s.estado.sesionCaja?.efectivoInicialClp).toBe(7500);
  });

  it('el botón Entrar espera al menos 4 dígitos', async () => {
    const u = userEvent.setup();
    render(<App api={servidorFalso().api} />);
    await u.click(await screen.findByRole('button', { name: /Cajero/ }));
    await teclear(u, '000');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    expect(screen.getByLabelText('3 dígitos ingresados')).toBeInTheDocument();
  });

  it('PIN incorrecto: avisa los intentos que quedan y luego el bloqueo', async () => {
    const u = userEvent.setup();
    render(<App api={servidorFalso().api} />);
    await u.click(await screen.findByRole('button', { name: /Cajero/ }));
    await u.keyboard('1111{Enter}');
    expect(await screen.findByText('PIN incorrecto. Te quedan 4 intentos.')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await u.keyboard('1111{Enter}');
    expect(await screen.findByText('PIN incorrecto. Te quedan 1 intento.')).toBeInTheDocument();
    await u.keyboard('1111{Enter}');
    expect(await screen.findByText('Demasiados intentos. Espera 60 segundos.')).toBeInTheDocument();
  });

  it('Esc o "Cambiar usuario" vuelven a la lista', async () => {
    const u = userEvent.setup();
    render(<App api={servidorFalso().api} />);
    await u.click(await screen.findByRole('button', { name: /Cajero/ }));
    await u.click(screen.getByRole('button', { name: 'Cambiar usuario' }));
    await u.click(await screen.findByRole('button', { name: /Dueño/ }));
    expect(screen.getByRole('heading', { name: 'Hola, Dueño' })).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.getByText('¿Quién atiende?')).toBeInTheDocument();
  });

  it('con un solo usuario va directo al PIN', async () => {
    render(
      <App
        api={
          servidorFalso({ usuarios: [{ id: 'u1', name: 'Rosa', role: 'DUENO', pin: '1234' }] }).api
        }
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Hola, Rosa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar usuario' })).not.toBeInTheDocument();
  });

  it('sin usuarios activos lo explica', async () => {
    render(<App api={servidorFalso({ usuarios: [] }).api} />);
    expect(
      await screen.findByText('No hay usuarios activos. Pide al dueño que cree uno.'),
    ).toBeInTheDocument();
  });

  it('si no carga la lista de usuarios, permite reintentar', async () => {
    const u = userEvent.setup();
    const s = servidorFalso({
      forzar: {
        'GET /auth/usuarios': {
          status: 500,
          body: { error: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' },
        },
      },
    });
    render(<App api={s.api} />);
    expect(await screen.findByText('Error interno del servidor')).toBeInTheDocument();
    s.estado.forzar = {};
    await u.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Cajero/ })).toBeInTheDocument();
  });
});

describe('sesión', () => {
  it('con la caja ya abierta va directo a la caja', async () => {
    const u = userEvent.setup();
    const s = servidorFalso({
      sesionCaja: {
        id: 's1',
        abiertaPor: { id: 'u1', name: 'Dueño' },
        abiertaEn: '',
        efectivoInicialClp: 20000,
      },
    });
    render(<App api={s.api} />);
    await entrarComoCajero(u);
    expect(await screen.findByLabelText('Escanea o escribe un código')).toBeInTheDocument();
  });

  it('retoma la sesión guardada al recargar; si venció, pide el PIN', async () => {
    const s = servidorFalso();
    const u = userEvent.setup();
    const { unmount } = render(<App api={s.api} />);
    await entrarComoCajero(u);
    await screen.findByRole('heading', { name: 'Abrir Caja 1' });
    unmount();

    render(<App api={servidorFalso({ tokens: s.estado.tokens }).api} />);
    expect(await screen.findByRole('heading', { name: 'Abrir Caja 1' })).toBeInTheDocument();
  });

  it('un token vencido vuelve al PIN', async () => {
    guardarToken('vencido');
    render(<App api={servidorFalso().api} />);
    expect(await screen.findByText('¿Quién atiende?')).toBeInTheDocument();
  });

  it('Salir cierra la sesión y vuelve a la lista de usuarios', async () => {
    const u = userEvent.setup();
    const s = servidorFalso();
    render(<App api={s.api} />);
    await entrarComoCajero(u);
    await screen.findByRole('heading', { name: 'Abrir Caja 1' });
    await u.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByText('¿Quién atiende?')).toBeInTheDocument();
    expect(s.estado.tokens.size).toBe(0);
  });

  it('si el servidor pierde la sesión (reinicio), vuelve al PIN', async () => {
    const u = userEvent.setup();
    const s = servidorFalso();
    render(<App api={s.api} />);
    await entrarComoCajero(u);
    await screen.findByRole('heading', { name: 'Abrir Caja 1' });
    s.estado.tokens.clear();
    await u.keyboard('{Enter}');
    expect(await screen.findByText('¿Quién atiende?')).toBeInTheDocument();
  });

  it('muestra el error de apertura', async () => {
    const u = userEvent.setup();
    const s = servidorFalso({
      forzar: {
        'POST /cash/open': {
          status: 409,
          body: { error: 'CAJA_ABIERTA', mensaje: 'La caja ya está abierta (la abrió Dueño)' },
        },
      },
    });
    render(<App api={s.api} />);
    await entrarComoCajero(u);
    await u.click(await screen.findByRole('button', { name: 'Abrir caja' }));
    expect(await screen.findByText('La caja ya está abierta (la abrió Dueño)')).toBeInTheDocument();
  });

  it('si no puede consultar la caja, permite reintentar', async () => {
    const u = userEvent.setup();
    const s = servidorFalso({
      forzar: {
        'GET /cash/current': {
          status: 404,
          body: { error: 'CAJA_NO_ENCONTRADA', mensaje: 'No hay una caja activa' },
        },
      },
    });
    render(<App api={s.api} />);
    await entrarComoCajero(u);
    expect(await screen.findByText('No hay una caja activa')).toBeInTheDocument();
    s.estado.forzar = {};
    await u.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Abrir Caja 1' })).toBeInTheDocument(),
    );
  });
});
