import { defineConfig, devices } from '@playwright/test';

const port = 43124;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}/study-buddy/`,
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2.625,
    ...devices['Pixel 7'],
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/study-buddy/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
