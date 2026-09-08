import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 200000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 2,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    [
      "json",
      {
        outputFile:
          process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ||
          ".tools/test-runs/browser.json",
      },
    ],
  ],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PW_EDGE ? { channel: "msedge" } : {}),
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
