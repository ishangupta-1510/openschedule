import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:42719",
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: "npm run demo",
    url: "http://127.0.0.1:42719",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
