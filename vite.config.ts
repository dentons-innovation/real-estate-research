import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    // `vite preview` serves the built app on Railway — accept the platform's
    // public hostname (static demo content, nothing sensitive to protect here)
    allowedHosts: true,
  },
})
