import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ModalAcercaDe } from '../componentes/ModalAcercaDe.js';
import { servidorConSesion } from '../test/servidorFalso.js';
import { PantallaConfiguracion } from './PantallaConfiguracion.js';

function montar(...args: Parameters<typeof servidorConSesion>) {
  const s = servidorConSesion(...args);
  const u = userEvent.setup();
  render(<PantallaConfiguracion api={s.api} />);
  return { s, u };
}

describe('configuración del local', () => {
  it('guarda datos del local, modalidad, redondeo y prefijos de balanza (solo lo cambiado)', async () => {
    const { s, u } = montar();
    const nombre = await screen.findByLabelText('Nombre o razón social');
    expect(nombre).toHaveValue('Almacén de Prueba');
    await u.clear(nombre);
    await u.type(nombre, 'Almacén Doña Rosa');
    await u.type(screen.getByLabelText('RUT'), '76.086.428-5');
    await u.click(
      screen.getByRole('radio', { name: /Emito la boleta en la app e-Boleta del SII/ }),
    );
    await u.click(screen.getByRole('checkbox', { name: /Redondear el efectivo/ }));
    await u.click(
      within(screen.getByRole('group', { name: 'Prefijos con precio' })).getByRole('checkbox', {
        name: '26',
      }),
    );
    await u.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(await screen.findByText('Configuración guardada.')).toBeInTheDocument();
    expect(s.estado.configGuardada[0]).toEqual({
      razonSocial: 'Almacén Doña Rosa',
      rut: '76.086.428-5',
      dteProvider: 'PUENTE_MANUAL',
      cashRoundingEnabled: false,
      prefijosBalanzaPrecio: ['26'],
    });
    await u.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
  });

  it('muestra el error del servidor (RUT inválido) y el modelo de emisión', async () => {
    const { s, u } = montar();
    await u.type(await screen.findByLabelText('RUT'), '1-1');
    await u.click(screen.getByRole('radio', { name: /Emito boleta también con tarjeta/ }));
    await u.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(await screen.findByText('El RUT no es válido')).toBeInTheDocument();
    expect(s.estado.configGuardada[0]).toMatchObject({
      rut: '1-1',
      modeloEmision: 'TODO_MEDIO_PAGO',
    });
  });

  it('impresora: elegir una instalada, guardar, imprimir prueba y abrir cajón', async () => {
    const { s, u } = montar();
    await u.selectOptions(await screen.findByLabelText('Conexión'), 'SISTEMA');
    await u.click(screen.getByRole('button', { name: 'Buscar impresoras instaladas' }));
    await u.click(await screen.findByRole('button', { name: 'XP-58' }));
    expect(screen.getByLabelText('Nombre de la impresora')).toHaveValue('XP-58');
    await u.selectOptions(screen.getByLabelText('Ancho del papel'), '58');
    await u.click(screen.getByRole('button', { name: 'Guardar impresora' }));
    expect(await screen.findByText('Impresora guardada.')).toBeInTheDocument();
    expect(s.estado.impresoraCfg).toMatchObject({
      transporte: 'SISTEMA',
      destino: 'XP-58',
      anchoMm: 58,
    });
    expect(screen.getByLabelText(/Columnas/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Imprimir prueba' }));
    expect(await screen.findByText('Prueba enviada a la impresora.')).toBeInTheDocument();
    expect(screen.getByLabelText('Vista previa de la prueba')).toHaveTextContent('P R U E B A');
    await u.click(screen.getByRole('button', { name: 'Abrir cajón' }));
    expect(await screen.findByText('Cajón abierto.')).toBeInTheDocument();
  });

  it('impresora de red sin IP: muestra el error', async () => {
    const { u } = montar();
    await u.selectOptions(await screen.findByLabelText('Conexión'), 'RED');
    await u.click(screen.getByRole('button', { name: 'Guardar impresora' }));
    expect(await screen.findByText('Falta la dirección IP de la impresora')).toBeInTheDocument();
  });

  it('sin impresora: la prueba muestra igual la vista previa', async () => {
    const { u } = montar();
    await u.click(await screen.findByRole('button', { name: 'Imprimir prueba' }));
    expect(await screen.findByText('No hay impresora configurada.')).toBeInTheDocument();
  });
});

describe('primera configuración', () => {
  it('muestra los pasos, prueba el lector y el QR de vinculación', async () => {
    const { u } = montar();
    expect(
      await screen.findByRole('heading', { name: 'Primera configuración' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Faltan: RUT/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Código QR para vincular el celular' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Instalación: inst-1/)).toBeInTheDocument();

    await u.type(screen.getByLabelText('Código de barras'), '7801');
    await u.click(screen.getByRole('button', { name: 'Probar código' }));
    expect(await screen.findByText('Lector OK: Bebida cola 1,5 L')).toBeInTheDocument();
  });
});

describe('respaldos', () => {
  it('muestra el último respaldo y crea uno nuevo', async () => {
    const s = servidorConSesion();
    const dueno = s.estado.usuarios.find((u) => u.role === 'DUENO');
    if (!dueno) throw new Error('falta el dueño');
    s.estado.tokens.set('t-prueba', dueno);
    s.api.usarToken('t-prueba');
    const u = userEvent.setup();
    render(<PantallaConfiguracion api={s.api} />);

    expect(await screen.findByText('Todavía no hay respaldos.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Respaldar ahora' }));
    expect(await screen.findByText('Respaldo creado.')).toBeInTheDocument();
    expect(s.estado.respaldos).toHaveLength(1);
    expect(screen.getByText(/Último respaldo/)).toBeInTheDocument();
  });
});

describe('Acerca de', () => {
  it('muestra la versión y la atribución ODbL con sus enlaces', async () => {
    const s = servidorConSesion();
    render(<ModalAcercaDe api={s.api} alCerrar={() => undefined} />);
    const ventana = screen.getByRole('dialog', { name: 'Acerca de' });
    await waitFor(() => expect(ventana).toHaveTextContent('Almacén POS · versión 0.1.0'));
    expect(ventana).toHaveTextContent(
      'Datos de productos de Open Food Facts (https://openfoodfacts.org) y proyectos asociados.',
    );
    expect(ventana).toHaveTextContent('Desarrollado por Arrayan Labs');
    expect(within(ventana).getByRole('link', { name: 'arrayan.labs@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:arrayan.labs@gmail.com',
    );
    expect(
      within(ventana).getByRole('link', { name: 'https://openfoodfacts.org' }),
    ).toHaveAttribute('href', 'https://openfoodfacts.org');
    expect(within(ventana).getByRole('link', { name: 'ODbL-1.0' })).toHaveAttribute(
      'href',
      'https://opendatacommons.org/licenses/odbl/1-0/',
    );
    expect(within(ventana).getByRole('link', { name: 'Open Food Facts' })).toBeInTheDocument();
    expect(ventana).toHaveTextContent('11.027 productos en la base · generada el 2026-10-25');
  });

  it('avisa si no puede cargar', async () => {
    const s = servidorConSesion({
      forzar: {
        'GET /about': { status: 500, body: { error: 'X', mensaje: 'Error interno del servidor' } },
      },
    });
    render(<ModalAcercaDe api={s.api} alCerrar={() => undefined} />);
    expect(await screen.findByText('Error interno del servidor')).toBeInTheDocument();
  });
});
