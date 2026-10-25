import type { FastifyInstance } from 'fastify';

/**
 * Orígenes de la ventana de Tauri (ADR-005): macOS/Linux usan `tauri://localhost`; Windows,
 * `http://tauri.localhost` (o https). El navegador en desarrollo pasa por el proxy de Vite y no
 * necesita CORS. Cualquier otra página web queda bloqueada por el navegador.
 */
export const ORIGENES_TAURI: readonly string[] = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
];

export function registrarCors(
  app: FastifyInstance,
  origenes: readonly string[] = ORIGENES_TAURI,
): void {
  app.addHook('onRequest', async (req, reply) => {
    const origen = req.headers.origin;
    if (!origen || !origenes.includes(origen)) return;
    void reply.header('access-control-allow-origin', origen);
    void reply.header('vary', 'Origin');
    if (req.method === 'OPTIONS') {
      void reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE');
      void reply.header('access-control-allow-headers', 'authorization, content-type');
      void reply.header('access-control-max-age', '600');
      await reply.code(204).send();
    }
  });
}
