import { defineConfig, mergeConfig } from "vitest/config";
import app from "./vite.config.ts";

export default mergeConfig(
  app,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["tests/setup.ts"],
    },
  }),
);
