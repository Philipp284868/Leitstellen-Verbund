import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: process.env.LV_DEV_BACKEND
    ? {
        watch: {
          ignored: [
            "**/playwright-report/**",
            "**/test-results/**",
            "**/.tools/**",
            "**/dist/**",
            "**/docs/**",
            "**/*.log",
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
    outDir: "dist/client",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "maplibre",
              test: /node_modules.*maplibre-gl/,
              priority: 20,
            },
            { name: "vendor", test: /node_modules/, priority: 10 },
          ],
        },
      },
    },
  },
});
