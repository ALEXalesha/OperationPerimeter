// Проверки в безголовом Chromium по файловому адресу, по одной за раз.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: process.env.CI ? 90_000 : 30_000,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] },
  },
});
