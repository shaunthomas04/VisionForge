import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/apps': 'http://localhost:8000',
      '/run_sse': 'http://localhost:8000',
    },
  },
})
