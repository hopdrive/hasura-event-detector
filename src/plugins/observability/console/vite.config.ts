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
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
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
    // Pre-bundle all dependencies to avoid CommonJS/ESM issues
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'lodash-es',
      'react-is',
      'recharts',
      'jsondiffpatch',
      'react-json-tree',
      'antd',
      '@apollo/client',
      'graphql',
      'reactflow',
      'framer-motion',
      'use-sync-external-store/shim/with-selector'
    ],
    esbuildOptions: {
      // Treat all as ESM
      mainFields: ['module', 'main']
    }
  }
});
