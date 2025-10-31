import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    allowedHosts: ['.ngrok-free.app'],
    proxy: {
      '/api/grafana': {
        target: process.env.VITE_GRAFANA_HOST || 'https://logs-prod-036.grafana.net',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/grafana/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Build as a standard app, not a library
    // The console is meant to be served, not imported
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  define: {
    // Properly define process.env.NODE_ENV
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
