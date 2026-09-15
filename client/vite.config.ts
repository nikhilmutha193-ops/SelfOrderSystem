import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_DEV_API || 'http://localhost:5000',
      '/uploads': process.env.VITE_DEV_API || 'http://localhost:5000',
    },
  },
})
