import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The release script keeps package.json's version in step with the project's VERSION file.
const appVersion: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_DEV_API || 'http://localhost:5000',
      '/uploads': process.env.VITE_DEV_API || 'http://localhost:5000',
    },
  },
})
