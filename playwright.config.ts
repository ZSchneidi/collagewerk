import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:4319', viewport: { width: 1400, height: 950 } },
  webServer: { command: 'npx vite preview', url: 'http://localhost:4319/editor.html', reuseExistingServer: true },
});
