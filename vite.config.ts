import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// Short commit shown in the app footer so a phone can confirm which build it runs.
function buildVersion(): string {
  const fromCi = process.env.GITHUB_SHA?.slice(0, 7)
  if (fromCi) return fromCi
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

// VITE_BASE overrides the public path. The default matches
// https://jasonvgriffin.github.io/study-buddy/
// Set VITE_BASE=/ for a site served from the domain root, or ./ for a relative build.
const base = process.env.VITE_BASE || '/study-buddy/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@napi-rs/canvas'],
  },
  server: {
    host: '0.0.0.0',
    port: 43123,
  },
})
