import { defineConfig, devices } from '@playwright/test';

// Runs against a production build and a local Supabase (`supabase start`). See README.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
  webServer: { command: 'npm run start -- -p 3100', url: 'http://127.0.0.1:3100/login', reuseExistingServer: true, timeout: 60_000 },
});
