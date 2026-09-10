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
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /\.firefox\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PW_EDGE ? { channel: "msedge" } : {}),
      },
    },
    {
      name: "firefox",
      testIgnore: /\.chromium\.spec\.ts$/,
      use: {
        ...devices["Desktop Firefox"],
        // The Linux CI runner has no GPU. Use its real Mesa/Xvfb rendering
        // context instead of Firefox's WebGL2-disabled headless backend.
        ...(process.env.LV_CI_SOFTWARE_GL === "1"
          ? {
              headless: false,
              launchOptions: {
                firefoxUserPrefs: {
                  "webgl.force-enabled": true,
                  "webgl.forbid-software": false,
                },
              },
            }
          : {}),
      },
    },
  ],
});
