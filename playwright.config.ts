import { defineConfig } from "@playwright/test";
const port = process.env.MISSION_TEST_PORT ?? "1421";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  reporter: "list",
});
