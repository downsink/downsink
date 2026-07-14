import {defineConfig, devices} from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'node server.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {args: ['--enable-precise-memory-info', '--js-flags=--expose-gc']},
      },
    },
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}},
  ],
})
