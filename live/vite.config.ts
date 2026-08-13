import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/arkiv-rpc': {
        target: 'https://braga.hoodi.arkiv.network',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/arkiv-rpc/, '/rpc'),
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => req.removeHeader('origin'));
        },
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
