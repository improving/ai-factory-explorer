import { defineConfig } from '@playwright/test'

// `npm run e2e` opens the single file, dist/index.html, in Chromium.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
})
