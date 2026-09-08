import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
const germany = process.env.LV_BUILD_WORLD === "germany-1";
export default defineConfig({
  base: "/",
  define: {
    __LV_WORLD__: JSON.stringify(germany ? "germany-1" : "rivermere-1"),
  },
  resolve: germany
    ? {
        alias: [
          {
            find: /^(.*[\\/])?world$/,
            replacement: resolve("src/germany/world.ts"),
          },
          {
            find: /^\.\/Map$/,
            replacement: resolve("src/germany/GermanyMap.tsx"),
          },
          {
            find: /^\.\/RegionScene$/,
            replacement: resolve("src/germany/GermanyScene.tsx"),
          },
        ],
      }
    : undefined,
  plugins: [react()],
  server: process.env.LV_DEV_BACKEND
    ? {
        watch: {
          ignored: [
            "**/playwright-report/**",
            "**/test-results/**",
            "**/.tools/**",
          ],
        },
        proxy: {
          "/project-news.json": { target: process.env.LV_DEV_BACKEND },
          "/api": { target: process.env.LV_DEV_BACKEND },
          "/geo": { target: process.env.LV_DEV_BACKEND },
          "/socket.io": { target: process.env.LV_DEV_BACKEND, ws: true },
        },
      }
    : undefined,
  build: {
    outDir: germany ? "dist/germany/client" : "dist/client",
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
});
