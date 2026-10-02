// The installable web app (phones, via the browser) and `npm run dev:web`.
// The preload bridge is replaced by src/renderer/src/platform/web-shim.ts.
// `npm run build:web` writes out/web; FREEGAZ_WEB_BASE sets the path it is
// served from (GitHub Pages serves it under /FreeGaz/).
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

/** Manifest, icons and home-screen tags: the web build only, so the desktop app's page is unchanged. */
function installable(): Plugin {
  return {
    name: 'freegaz-installable',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '</head>',
          [
            '<link rel="manifest" href="manifest.webmanifest" />',
            '<meta name="theme-color" content="#111d36" />',
            '<meta name="apple-mobile-web-app-capable" content="yes" />',
            '<meta name="mobile-web-app-capable" content="yes" />',
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
            '<meta name="apple-mobile-web-app-title" content="FreeGaz" />',
            '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />',
            '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png" />',
            '</head>',
          ].join('\n    '),
        ),
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: process.env.FREEGAZ_WEB_BASE ?? '/',
  publicDir: resolve(__dirname, 'src/renderer/web-public'),
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  define: { __FREEGAZ_WEB__: 'true', __FREEGAZ_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss(), installable()],
  server: { port: 5198, strictPort: true },
  build: {
    // the iPhone app's copy builds to out/ios-web (FREEGAZ_WEB_OUT), next to the Pages one
    outDir: resolve(__dirname, process.env.FREEGAZ_WEB_OUT ?? 'out/web'),
    emptyOutDir: true,
    // the phone app is one page; the mini-HUD is desktop-only
    rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
