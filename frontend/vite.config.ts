import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/apps': 'http://localhost:8000',
      '/run_sse': {
        target: 'http://localhost:8000',
        changeOrigin: false,
        // Disable gzip so the proxy doesn't buffer the SSE stream
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('accept-encoding', 'identity')
          })
        },
      },
    },
  },
})
