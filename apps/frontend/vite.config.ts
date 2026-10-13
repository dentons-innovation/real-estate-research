import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // local development: the backend runs on :8080 (npm run dev:backend / dev:mock)
    proxy: {
      '/api': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
})
