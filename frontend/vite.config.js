import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Forward cookies from the browser to the API server
            const cookie = req.headers.cookie;
            if (cookie) {
              proxyReq.setHeader('cookie', cookie);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Forward set-cookie headers from API server to browser
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              res.setHeader('set-cookie', setCookie);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});