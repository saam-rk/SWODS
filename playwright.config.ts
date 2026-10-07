import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.mjs',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'audit-artifacts/after/playwright.json' }]],
  use: { actionTimeout: 15000, navigationTimeout: 20000, baseURL: 'http://127.0.0.1:3100', viewport: { width: 375, height: 812 }, locale: 'en-US', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [
    {name:'chromium',use:{browserName:'chromium'}},
    {name:'firefox',use:{browserName:'firefox'}},
    {name:'webkit',use:{browserName:'webkit'}},
  ],
  webServer: { command: 'npm run build:demo && npm run start -- --hostname 127.0.0.1 --port 3100', url:'http://127.0.0.1:3100', reuseExistingServer: !process.env.CI, timeout:180000 },
});
