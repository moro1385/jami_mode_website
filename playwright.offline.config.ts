import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/offline',
  outputDir: '.phase3-e2e-artifacts/results',
  reporter: [['list'], ['json', { outputFile: '.phase3-e2e-artifacts/report.json' }]],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4179',
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'chrome' } : {}),
    launchOptions: { args: ['--disable-background-networking'] },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-offline-e2e.mjs',
    url: 'http://127.0.0.1:4179/__offline_e2e__/health',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
