import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  globalTimeout: 1_200_000, // 20min per shard (suite is sharded 1/4 on main-push; workers:1 serial)
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
