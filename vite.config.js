import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the built dist/ works when hosted from any sub-path.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          chart: ['chart.js'],
          pdf: ['jspdf']
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ProtoMacro — Nutrition & Fitness Tracker',
        short_name: 'ProtoMacro',
        description: 'Private, local-first nutrition and fitness platform: BMI/TDEE, macro tracking, meal planning, habits, workouts and progress analytics.',
        theme_color: '#0A0E0C',
        background_color: '#0A0E0C',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            /* USDA lookups: network-first, short-lived fallback cache */
            urlPattern: /^https:\/\/api\.nal\.usda\.gov\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'usda-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
