/**
 * Cómo llegan los bytes ESC/POS a la impresora (ADR-005: imprime el servidor local).
 * - RED: TCP directo al puerto 9100 (impresoras Ethernet/Wi-Fi).
 * - SISTEMA: cola de impresión del sistema en modo RAW (USB con driver del fabricante).
 *   macOS/Linux con `lp -o raw`; Windows con la API winspool vía PowerShell.
 * - ARCHIVO: escribe en una carpeta (pruebas y demos) o en un dispositivo (/dev/usb/lp0).
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class ErrorImpresion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorImpresion';
  }
}

export interface Transporte {
  enviar(bytes: Uint8Array): Promise<void>;
}

export interface ResultadoComando {
  codigo: number | null;
  stdout: string;
  stderr: string;
}

export type Ejecutar = (
  comando: string,
  args: readonly string[],
  entrada?: Uint8Array,
) => Promise<ResultadoComando>;

const TIEMPO_MAX_MS = 15_000;

/** Ejecuta un comando del sistema con tiempo máximo. No usa shell (sin inyección). */
export const ejecutarComando: Ejecutar = (comando, args, entrada) =>
  new Promise((resolve, reject) => {
    const hijo = spawn(comando, args, { stdio: 'pipe', windowsHide: true, timeout: TIEMPO_MAX_MS });
    let stdout = '';
    let stderr = '';
    hijo.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    hijo.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    hijo.on('error', reject);
    hijo.on('close', (codigo) => {
      resolve({ codigo, stdout, stderr });
    });
    hijo.stdin.end(entrada ? Buffer.from(entrada) : undefined);
  });

// ---------- RED ----------

export function parsearDestinoRed(destino: string): { host: string; puerto: number } | null {
  const m = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(destino.trim());
  if (!m?.[1]) return null;
  const puerto = m[2] ? Number(m[2]) : 9100;
  if (puerto < 1 || puerto > 65535) return null;
  return { host: m[1], puerto };
}

export function transporteRed(destino: string, tiempoMaxMs = 5000): Transporte {
  const d = parsearDestinoRed(destino);
  if (!d) throw new ErrorImpresion(`Dirección de impresora inválida: "${destino}"`);
  return {
    enviar: (bytes) =>
      new Promise((resolve, reject) => {
        const socket = connect({ host: d.host, port: d.puerto });
        let terminado = false;
        const fallar = (mensaje: string) => {
          if (terminado) return;
          terminado = true;
          socket.destroy();
          reject(new ErrorImpresion(mensaje));
        };
        socket.setTimeout(tiempoMaxMs, () => {
          // Ya enviado y la impresora no cerró: se corta la conexión sin error.
          if (terminado) socket.destroy();
          else fallar(`La impresora ${d.host}:${d.puerto} no responde`);
        });
        socket.on('error', (e: NodeJS.ErrnoException) => {
          fallar(
            e.code === 'ECONNREFUSED'
              ? `La impresora ${d.host}:${d.puerto} rechazó la conexión`
              : `No se pudo conectar con la impresora ${d.host}:${d.puerto} (${e.code ?? e.message})`,
          );
        });
        // Se da por impreso cuando los datos salieron: algunas impresoras no cierran la conexión.
        socket.on('connect', () => {
          socket.write(Buffer.from(bytes), (error) => {
            if (error) {
              fallar(`No se pudo enviar el ticket a ${d.host}:${d.puerto}`);
              return;
            }
            terminado = true;
            socket.end();
            resolve();
          });
        });
      }),
  };
}

// ---------- SISTEMA ----------

/** Envía RAW a una cola de Windows con OpenPrinter/WritePrinter (sin compartir la impresora). */
export const SCRIPT_WINDOWS = String.raw`param([string]$Printer, [string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AlmacenRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int StartDocPrinter(IntPtr h, int level, DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("No se pudo abrir la impresora " + printer);
    try {
      var di = new DOCINFO { pDocName = "Almacen POS", pDataType = "RAW" };
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("La cola no aceptó el trabajo");
      try {
        StartPagePrinter(h);
        int w;
        if (!WritePrinter(h, data, data.Length, out w) || w != data.Length) throw new Exception("No se pudo enviar el ticket");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
[AlmacenRawPrinter]::Send($Printer, [System.IO.File]::ReadAllBytes($Path))
`;

export function transporteSistema(
  cola: string,
  deps: { ejecutar?: Ejecutar; plataforma?: NodeJS.Platform } = {},
): Transporte {
  const ejecutar = deps.ejecutar ?? ejecutarComando;
  const plataforma = deps.plataforma ?? process.platform;
  if (cola.trim() === '') throw new ErrorImpresion('Falta el nombre de la impresora del sistema');

  const revisar = (r: ResultadoComando) => {
    if (r.codigo !== 0) {
      const detalle = (r.stderr || r.stdout).trim().split('\n')[0] ?? '';
      throw new ErrorImpresion(
        `La impresora "${cola}" no aceptó el ticket${detalle ? `: ${detalle}` : ''}`,
      );
    }
  };

  if (plataforma === 'win32') {
    return {
      async enviar(bytes) {
        // TODO: verificar en Windows con la impresora real del usuario (Fase 3, paso de hardware).
        const base = join(tmpdir(), `almacen-${randomUUID()}`);
        const script = `${base}.ps1`;
        const datos = `${base}.bin`;
        try {
          await writeFile(script, SCRIPT_WINDOWS, 'utf8');
          await writeFile(datos, bytes);
          const args = [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            '-Printer',
            cola,
            '-Path',
            datos,
          ];
          revisar(await ejecutar('powershell.exe', args).catch(fallaComando('powershell.exe')));
        } finally {
          await Promise.all([rm(script, { force: true }), rm(datos, { force: true })]);
        }
      },
    };
  }
  return {
    async enviar(bytes) {
      revisar(await ejecutar('lp', ['-d', cola, '-o', 'raw'], bytes).catch(fallaComando('lp')));
    },
  };
}

const fallaComando = (comando: string) => (e: unknown) => {
  throw new ErrorImpresion(
    `No se pudo usar "${comando}" para imprimir (${e instanceof Error ? e.message : String(e)})`,
  );
};

/** Colas de impresión instaladas en el equipo (para elegir en la configuración). */
export async function listarColasSistema(
  deps: { ejecutar?: Ejecutar; plataforma?: NodeJS.Platform } = {},
): Promise<string[]> {
  const ejecutar = deps.ejecutar ?? ejecutarComando;
  const plataforma = deps.plataforma ?? process.platform;
  try {
    const r =
      plataforma === 'win32'
        ? await ejecutar('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Get-Printer | ForEach-Object { $_.Name }',
          ])
        : await ejecutar('lpstat', ['-e']);
    if (r.codigo !== 0) return [];
    return r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------- ARCHIVO ----------

let secuencia = 0;

export function transporteArchivo(
  destino: string,
  reloj: () => Date = () => new Date(),
): Transporte {
  if (destino.trim() === '') throw new ErrorImpresion('Falta la carpeta o el dispositivo');
  return {
    async enviar(bytes) {
      let esCarpeta: boolean;
      try {
        esCarpeta = statSync(destino).isDirectory();
      } catch {
        throw new ErrorImpresion(`No existe "${destino}"`);
      }
      secuencia += 1;
      const marca = reloj()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '-')
        .replace('.', '-')
        .slice(0, 19);
      const ruta = esCarpeta ? join(destino, `ticket-${marca}-${secuencia}.bin`) : destino;
      try {
        await writeFile(ruta, bytes);
      } catch (e) {
        throw new ErrorImpresion(
          `No se pudo escribir en "${ruta}" (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
        );
      }
    },
  };
}
