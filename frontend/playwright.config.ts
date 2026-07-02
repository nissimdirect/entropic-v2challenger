import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  globalTimeout: 600_000,
  timeout: 30_000,
  retries: 1,
  workers: 1, // Electron tests must run serially
  reporter: process.env.CI
    ? 'blob'
    : [['html', { open: 'never' }], ['list']],
  use: {
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    timeout: 5_000,
  },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
})
