/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    // Shown in Settings and in the "Updated to..." notice. The date makes every new build differ from the old one.
    __APP_VERSION__: JSON.stringify(`v${process.env.npm_package_version ?? '0.0.0'} · ${new Date().toISOString().slice(0, 10)}`),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered by hand in src/state/pwaUpdate.ts
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true, // the new worker takes over open tabs
        skipWaiting: true, // no waiting for every tab to close
      },
      manifest: {
        name: 'Global Empire',
        short_name: 'Global Empire',
        description: 'Build a business empire from a single factory to a global fortune.',
        display: 'standalone',
        background_color: '#0b1424',
        theme_color: '#0b1424',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
