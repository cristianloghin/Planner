import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Repo is served from https://<user>.github.io/Planner/ on GitHub Pages,
// so the base path must match the repo name.
const base = '/Planner/'

export default defineConfig({
  base,
  optimizeDeps: {
    // The @mikrostack packages are developed alongside this app and change
    // often. Vite's pre-bundle of dependencies is keyed on the lockfile and
    // can go on serving an old copy after an upgrade, which looks exactly
    // like the new version not working. Kept out of it, they are served
    // straight from node_modules and a new version shows on the next reload.
    exclude: ['@mikrostack/notes', '@mikrostack/router', '@mikrostack/rst'],
    // A package kept out of the pre-bundle has its own dependencies served
    // raw too, and the router's `@mikrostack/chbus` cannot be: its package
    // points `import` at a CommonJS file (the ESM build sits beside it as
    // index.mjs), which only the pre-bundle's interop makes loadable. So it
    // is pre-bundled on the router's behalf until its packaging is fixed.
    include: ['@mikrostack/router > @mikrostack/chbus'],
  },
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
        // Google Sans Flex files are precached and work offline.
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
