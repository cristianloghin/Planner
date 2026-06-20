import { defineConfig } from 'vitest/config'

// A dedicated config for the unit suite. The app's `vite.config.ts` wires up the
// React + PWA plugins, which the pure-logic tests here don't need (and which only
// slow the run down), so the test runner uses this slim config instead.
export default defineConfig({
  test: {
    // Every covered module is pure date/string math — no DOM — so the fast
    // Node environment is enough.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
