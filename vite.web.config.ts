// Browser-only build of the renderer. The preload bridge is replaced by
// src/renderer/src/platform/web-shim.ts, and devices come from the simulator.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  define: { __FREEGAZ_WEB__: 'true' },
  plugins: [react(), tailwindcss()],
  server: { port: 5198, strictPort: true },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
})
