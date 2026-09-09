import { defineConfig, mergeConfig } from "vitest/config";
import app from "./vite.config.ts";

// Keep historical save/migration regression coverage separate from the app build.
// Rivermere's runtime is tested through rivermere.test.ts and every browser suite.
export default mergeConfig(
  app,
  defineConfig({
    define: { __LV_WORLD__: JSON.stringify("falkenried-2") },
    test: {
      include: ["tests/**/*.test.ts"],
      globalSetup: ["tests/legacy-build.ts"],
    },
  }),
);
