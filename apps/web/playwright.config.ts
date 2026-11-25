import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  globalSetup: './e2e/setup.ts',
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: join(tmpdir(), 'video-wizard-e2e-results', String(process.pid)),
  use: {
    actionTimeout: 10000,
    headless: true,
    launchOptions: {
      executablePath:
        process.env.STUDIO_TEST_CHROME ||
        (process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : undefined),
    },
    viewport: { width: 1280, height: 900 },
  },
});
