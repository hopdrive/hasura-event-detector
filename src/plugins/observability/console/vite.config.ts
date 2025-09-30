import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    // Define environment variables for the client
    'process.env': {}
  },
  resolve: {
    alias: {
      // Map lodash to lodash-es for ESM compatibility
      'lodash': 'lodash-es'
    }
  },
  optimizeDeps: {
    include: ['lodash-es']
  }
});
