import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const useHttps = process.env.HTTPS === 'true' || process.env.npm_lifecycle_event === 'dev:https';
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(useHttps ? [basicSsl()] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:8000',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            // Suppress spurious socket abort warnings during client page reload or reconnection
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            proxy.on('error', (err: any) => {
              if (err.code !== 'ECONNRESET' && err.code !== 'ECONNABORTED') {
                console.warn('[vite ws proxy]', err.message);
              }
            });
          },
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

