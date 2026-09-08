import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/",
  define: {
    __LV_WORLD__: JSON.stringify(process.env.LV_WORLD || "falkenried-2"),
  },
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
          "/socket.io": { target: process.env.LV_DEV_BACKEND, ws: true },
        },
      }
    : undefined,
  build: {
    outDir:
      process.env.LV_WORLD === "rivermere-1"
        ? "dist/worlds/rivermere/dist/client"
        : "dist/client",
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
