import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Development server configuration
  server: {
    port: 3000,
    host: true, // Allow external connections
    cors: true,
    proxy: {
      // Proxy GraphQL requests during development if needed
      '/v1/graphql': {
        target: process.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      }
    }
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor libraries for better caching
          vendor: ['react', 'react-dom'],
          antd: ['antd', '@ant-design/charts', '@ant-design/icons'],
          apollo: ['@apollo/client', 'graphql'],
          reactflow: ['reactflow']
        }
      }
    },
    // Increase chunk size warning limit for antd and charts
    chunkSizeWarningLimit: 1000
  },

  // Environment variable prefix
  envPrefix: 'REACT_APP_',

  // Define global constants
  define: {
    // Add any global constants here if needed
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },

  // CSS configuration
  css: {
    preprocessorOptions: {
      less: {
        // Antd theme customization
        modifyVars: {
          '@primary-color': '#1890ff',
          '@success-color': '#52c41a',
          '@error-color': '#ff4d4f',
          '@warning-color': '#faad14'
        },
        javascriptEnabled: true
      }
    }
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@graphql': '/src/graphql',
      '@utils': '/src/utils'
    }
  },

  // Optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'antd',
      '@ant-design/charts',
      '@ant-design/icons',
      '@apollo/client',
      'graphql',
      'reactflow'
    ]
  }
});