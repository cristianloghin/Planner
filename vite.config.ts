import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Repo is served from https://<user>.github.io/Planner/ on GitHub Pages,
// so the base path must match the repo name.
const base = '/Planner/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Default Workbox glob omits fonts; add woff2 so the self-hosted
      // Source Sans 3 files are precached and work offline.
      workbox: {
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
