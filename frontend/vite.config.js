import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeManifestIcons: false,
    manifest: {
      id: '/',
      name: 'МТС — Координатор инцидентов',
      short_name: 'МТС Инциденты',
      description: 'Рабочее место координатора инцидентов МТС',
      lang: 'ru',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#e30611',
      background_color: '#0c121d',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/(?:health|docs|redoc|swagger|openapi\.json)(?:\/|$)/],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: false,
      // Only the build's static shell is precached. API, auth and SSE stay on the network.
      runtimeCaching: [],
    },
  })],
  base: './',
  build: {
    outDir: '../backend/dashboard',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
