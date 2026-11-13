import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({
  optimizeDeps: { include: ['@codemirror/language', '@codemirror/state', '@codemirror/view', '@codemirror/commands', '@lezer/markdown', '@lezer/common'] },
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.browser.test.ts'] } },
      { test: { name: 'browser', include: ['tests/**/*.browser.test.ts'], browser: {
        enabled: true, provider: playwright({ launchOptions: { channel: 'chromium' } }),
        headless: true, instances: [{ browser: 'chromium' }]
      } } }
    ]
  }
});
