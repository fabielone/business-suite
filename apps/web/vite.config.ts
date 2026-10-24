import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineShell } from './offline-shell';

export default defineConfig(({ mode }) => ({
  plugins: [react(), offlineShell()],
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4310',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4310',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}));
