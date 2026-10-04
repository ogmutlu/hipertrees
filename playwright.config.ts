import { defineConfig } from "@playwright/test";
const executablePath = process.env["CHROMIUM_PATH"];
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173/hipertrees/",
    viewport: { width: 1440, height: 1050 },
    launchOptions: executablePath ? { executablePath } : {},
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/hipertrees/",
    reuseExistingServer: !process.env["CI"],
  },
});
