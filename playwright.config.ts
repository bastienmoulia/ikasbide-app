import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 2,
  reporter: process.env['CI'] ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:5100',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', testDir: './e2e', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testDir: './e2e', use: { ...devices['Pixel 7'] } },
    {
      name: 'webkit',
      testDir: './e2e',
      testMatch: 'display-mode.spec.ts',
      grep: /selector|tooltips/,
      use: { ...devices['Desktop Safari'] },
    },
    { name: 'firestore', testDir: './tests/firestore' },
  ],
});
