import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VITE_BASE overrides the public path. The default matches
// https://jasonvgriffin.github.io/study-buddy/
// Set VITE_BASE=/ for a site served from the domain root, or ./ for a relative build.
const base = process.env.VITE_BASE || '/study-buddy/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@napi-rs/canvas'],
  },
  server: {
    host: '0.0.0.0',
    port: 43123,
  },
})
