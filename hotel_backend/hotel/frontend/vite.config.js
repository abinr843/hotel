import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      workbox: {
        // Cache all static assets aggressively for offline app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Increase max file size for precaching (default is 2MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Cache Google Fonts for offline typography
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Hotel POS',
        short_name: 'HotelPOS',
        description: 'Hotel Point of Sale Management System',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  // Must match Django's STATIC_URL so django-vite resolves assets correctly
  base: '/static/',
  server: {
    port: 5173,
    // Allow Django dev server to request assets from Vite dev server
    cors: true,
    origin: 'http://localhost:5173',
  },
  build: {
    // Generate manifest.json for django-vite to map hashed filenames
    manifest: 'manifest.json',
    outDir: resolve('./dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve('./src/main.jsx'),
      },
    },
  },
});
