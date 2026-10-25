import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** El servidor local (apps/server) escucha en 127.0.0.1:3001. La caja lo llama como `/api/...`. */
const SERVIDOR = process.env['ALMACEN_SERVIDOR'] ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: SERVIDOR, rewrite: (ruta) => ruta.replace(/^\/api/, '') },
    },
  },
});
