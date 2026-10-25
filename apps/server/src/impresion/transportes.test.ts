import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorImpresion,
  listarColasSistema,
  parsearDestinoRed,
  transporteArchivo,
  transporteRed,
  transporteSistema,
  type Ejecutar,
} from './transportes.js';

const BYTES = Uint8Array.from([0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a]);

describe('parsearDestinoRed', () => {
  it.each([
    ['192.168.1.50', { host: '192.168.1.50', puerto: 9100 }],
    [' 192.168.1.50:9101 ', { host: '192.168.1.50', puerto: 9101 }],
    ['impresora.local:9100', { host: 'impresora.local', puerto: 9100 }],
  ])('%s', (texto, esperado) => {
    expect(parsearDestinoRed(texto)).toEqual(esperado);
  });
  it.each(['', 'http://x', '1.2.3.4:0', '1.2.3.4:70000', 'a b'])('rechaza "%s"', (t) => {
    expect(parsearDestinoRed(t)).toBeNull();
  });
});

describe('transporteRed', () => {
  const servidores: Server[] = [];
  afterEach(() => {
    for (const s of servidores.splice(0)) s.close();
  });

  const escuchar = (alConectar: (s: Socket) => void): Promise<number> =>
    new Promise((resolve) => {
      const srv = createServer(alConectar);
      servidores.push(srv);
      srv.listen(0, '127.0.0.1', () => {
        const dir = srv.address();
        resolve(typeof dir === 'object' && dir ? dir.port : 0);
      });
    });

  it('envía los bytes por TCP', async () => {
    let recibido = Buffer.alloc(0);
    let alTerminar: () => void = () => undefined;
    const terminado = new Promise<void>((r) => (alTerminar = r));
    const puerto = await escuchar((s) => {
      s.on('data', (d: Buffer) => (recibido = Buffer.concat([recibido, d])));
      s.on('end', () => {
        s.end();
        alTerminar();
      });
    });
    await transporteRed(`127.0.0.1:${puerto}`).enviar(BYTES);
    await terminado;
    expect(Array.from(recibido)).toEqual(Array.from(BYTES));
  });

  it('no queda esperando si la impresora no cierra la conexión', async () => {
    const puerto = await escuchar(() => undefined); // nunca cierra
    await expect(transporteRed(`127.0.0.1:${puerto}`, 50).enviar(BYTES)).resolves.toBeUndefined();
  });

  it('avisa si la impresora rechaza la conexión', async () => {
    const puerto = await escuchar(() => undefined);
    servidores.pop()?.close();
    await new Promise((r) => setTimeout(r, 20));
    await expect(transporteRed(`127.0.0.1:${puerto}`).enviar(BYTES)).rejects.toThrow(
      /rechazó la conexión/,
    );
  });

  it('avisa si no responde a tiempo', async () => {
    // 10.255.255.1 no es enrutable: la conexión queda colgada hasta el tiempo máximo.
    await expect(transporteRed('10.255.255.1:9100', 50).enviar(BYTES)).rejects.toThrow(
      ErrorImpresion,
    );
  });

  it('rechaza una dirección inválida', () => {
    expect(() => transporteRed('no valida')).toThrow(ErrorImpresion);
  });
});

describe('transporteSistema', () => {
  it('macOS/Linux: lp en modo raw con los bytes por la entrada estándar', async () => {
    const ejecutar = vi.fn<Ejecutar>().mockResolvedValue({ codigo: 0, stdout: '', stderr: '' });
    await transporteSistema('EPSON_TM_T20', { ejecutar, plataforma: 'darwin' }).enviar(BYTES);
    expect(ejecutar).toHaveBeenCalledWith('lp', ['-d', 'EPSON_TM_T20', '-o', 'raw'], BYTES);
  });

  it('informa el error de la cola', async () => {
    const ejecutar = vi.fn<Ejecutar>().mockResolvedValue({
      codigo: 1,
      stdout: '',
      stderr: 'lp: The printer or class does not exist.\nmás',
    });
    await expect(
      transporteSistema('X', { ejecutar, plataforma: 'linux' }).enviar(BYTES),
    ).rejects.toThrow(
      'La impresora "X" no aceptó el ticket: lp: The printer or class does not exist.',
    );
    const sinDetalle = vi.fn<Ejecutar>().mockResolvedValue({ codigo: 2, stdout: '', stderr: '' });
    await expect(
      transporteSistema('X', { ejecutar: sinDetalle, plataforma: 'linux' }).enviar(BYTES),
    ).rejects.toThrow('La impresora "X" no aceptó el ticket');
  });

  it('avisa si el comando no existe', async () => {
    const ejecutar = vi.fn<Ejecutar>().mockRejectedValue(new Error('spawn lp ENOENT'));
    await expect(
      transporteSistema('X', { ejecutar, plataforma: 'darwin' }).enviar(BYTES),
    ).rejects.toThrow('No se pudo usar "lp" para imprimir (spawn lp ENOENT)');
  });

  it('Windows: PowerShell con la API de impresión RAW, y borra los temporales', async () => {
    let rutas: string[] = [];
    const ejecutar = vi.fn<Ejecutar>().mockImplementation((comando, args) => {
      expect(comando).toBe('powershell.exe');
      const script = args[args.indexOf('-File') + 1] ?? '';
      const datos = args[args.indexOf('-Path') + 1] ?? '';
      expect(args[args.indexOf('-Printer') + 1]).toBe('POS-80');
      expect(readFileSync(script, 'utf8')).toContain('WritePrinter');
      expect(Array.from(readFileSync(datos))).toEqual(Array.from(BYTES));
      rutas = [script, datos];
      return Promise.resolve({ codigo: 0, stdout: '', stderr: '' });
    });
    await transporteSistema('POS-80', { ejecutar, plataforma: 'win32' }).enviar(BYTES);
    expect(rutas).toHaveLength(2);
    for (const r of rutas) expect(existsSync(r)).toBe(false);
  });

  it('Windows: también borra los temporales si falla', async () => {
    const ejecutar = vi
      .fn<Ejecutar>()
      .mockResolvedValue({ codigo: 1, stdout: 'No se pudo abrir la impresora POS-80', stderr: '' });
    await expect(
      transporteSistema('POS-80', { ejecutar, plataforma: 'win32' }).enviar(BYTES),
    ).rejects.toThrow('No se pudo abrir la impresora POS-80');
  });

  it('exige el nombre de la cola', () => {
    expect(() => transporteSistema('  ')).toThrow(ErrorImpresion);
  });
});

describe('listarColasSistema', () => {
  it('macOS: lpstat -e', async () => {
    const ejecutar = vi
      .fn<Ejecutar>()
      .mockResolvedValue({ codigo: 0, stdout: 'EPSON_TM_T20\nXprinter_58\n\n', stderr: '' });
    await expect(listarColasSistema({ ejecutar, plataforma: 'darwin' })).resolves.toEqual([
      'EPSON_TM_T20',
      'Xprinter_58',
    ]);
    expect(ejecutar).toHaveBeenCalledWith('lpstat', ['-e']);
  });
  it('Windows: Get-Printer', async () => {
    const ejecutar = vi
      .fn<Ejecutar>()
      .mockResolvedValue({ codigo: 0, stdout: 'POS-80\r\nMicrosoft Print to PDF\r\n', stderr: '' });
    await expect(listarColasSistema({ ejecutar, plataforma: 'win32' })).resolves.toEqual([
      'POS-80',
      'Microsoft Print to PDF',
    ]);
    expect(ejecutar.mock.calls[0]?.[0]).toBe('powershell.exe');
  });
  it('lista vacía si el comando falla o no existe', async () => {
    const falla = vi.fn<Ejecutar>().mockResolvedValue({ codigo: 1, stdout: 'x', stderr: '' });
    await expect(listarColasSistema({ ejecutar: falla, plataforma: 'darwin' })).resolves.toEqual(
      [],
    );
    const noExiste = vi.fn<Ejecutar>().mockRejectedValue(new Error('ENOENT'));
    await expect(listarColasSistema({ ejecutar: noExiste, plataforma: 'darwin' })).resolves.toEqual(
      [],
    );
  });
});

describe('transporteArchivo', () => {
  const carpeta = () => mkdtempSync(join(tmpdir(), 'almacen-impresion-'));

  it('en una carpeta crea un archivo por ticket', async () => {
    const dir = carpeta();
    const t = transporteArchivo(dir, () => new Date('2026-10-25T12:44:05.123Z'));
    await t.enviar(BYTES);
    await t.enviar(BYTES);
    const archivos = readdirSync(dir).sort();
    expect(archivos).toHaveLength(2);
    expect(archivos[0]).toMatch(/^ticket-20261025-124405-123-\d+\.bin$/);
    expect(Array.from(readFileSync(join(dir, archivos[0] ?? '')))).toEqual(Array.from(BYTES));
  });

  it('en un archivo o dispositivo existente escribe directo', async () => {
    const destino = join(carpeta(), 'lp0');
    writeFileSync(destino, '');
    await transporteArchivo(destino).enviar(BYTES);
    expect(Array.from(readFileSync(destino))).toEqual(Array.from(BYTES));
  });

  it('avisa si no existe o no se puede escribir', async () => {
    await expect(transporteArchivo('/no/existe/lp0').enviar(BYTES)).rejects.toThrow(
      'No existe "/no/existe/lp0"',
    );
    const soloLectura = join(carpeta(), 'ro');
    writeFileSync(soloLectura, '');
    chmodSync(soloLectura, 0o444);
    await expect(transporteArchivo(soloLectura).enviar(BYTES)).rejects.toThrow(
      /No se pudo escribir/,
    );
    expect(() => transporteArchivo('')).toThrow(ErrorImpresion);
  });
});
