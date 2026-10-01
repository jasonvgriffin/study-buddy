import { defineConfig, devices } from '@playwright/test';

const port = 43124;
const mobileViewport = { width: 412, height: 915 };

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}/study-buddy/`,
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    {
      name: 'firefox-mobile',
      use: { browserName: 'firefox', viewport: mobileViewport, hasTouch: true, deviceScaleFactor: 2.625 },
    },
    {
      name: 'webkit-mobile',
      use: {
        browserName: 'webkit',
        viewport: mobileViewport,
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2.625,
      },
    },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], browserName: 'firefox' } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], browserName: 'webkit' } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/study-buddy/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
