import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Repo is served from https://<user>.github.io/Planner/ on GitHub Pages,
// so the base path must match the repo name.
const base = '/Planner/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Prompt instead of autoUpdate: a silent auto-reload could land while an
      // EventEditor holds an unsaved draft (the realtime edit-guard can't stop a
      // service-worker reload). The UpdatePrompt toast lets the user apply the
      // update when it's safe. Registration is handled by `useRegisterSW`, so the
      // default `injectRegister: 'auto'` injects nothing.
      registerType: 'prompt',
      // Custom worker (src/sw.ts) instead of the generated one: Web Push needs
      // push/notificationclick handlers. It reproduces the generated worker's
      // precache + SPA fallback + prompt-update behaviour.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Default Workbox glob omits fonts; add woff2 so the self-hosted
        // Source Sans 3 files are precached and work offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      // Generate PNG/apple-touch/favicon assets from the SVG source and
      // auto-inject the matching <link> tags (incl. apple-touch-icon, which
      // iOS requires since it ignores SVG manifest icons).
      pwaAssets: {
        image: 'public/icon.svg',
        preset: 'minimal-2023',
      },
      manifest: {
        name: 'Planner',
        short_name: 'Planner',
        description: 'Plan and coordinate schedules together.',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: base,
        scope: base,
        // Icons are injected by pwaAssets (192/512 + maskable).
      },
    }),
  ],
})
