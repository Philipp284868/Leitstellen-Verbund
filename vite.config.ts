import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: process.env.LV_DEV_BACKEND
    ? {
        proxy: {
          "/api": { target: process.env.LV_DEV_BACKEND },
          "/socket.io": { target: process.env.LV_DEV_BACKEND, ws: true },
        },
      }
    : undefined,
  build: {
    outDir: "dist/client",
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
