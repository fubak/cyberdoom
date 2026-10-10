import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser smoke tests against the production build. The webServer block
 * builds with BASE_PATH=/cyberdoom/ (the GitHub Pages base) and serves it with
 * `vite preview`, so asset URLs and routing match the deployed site.
 *
 * Chromium only; WebGL runs on SwiftShader so no GPU is needed. Serial workers
 * keep frame-timing assertions meaningful (a parallel browser would skew the
 * deploy→play gap measurement).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/cyberdoom/',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/cyberdoom/',
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { BASE_PATH: '/cyberdoom/' },
  },
});
