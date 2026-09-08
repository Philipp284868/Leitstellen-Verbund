import { copyFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-server.mjs"],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, LV_WORLD: "rivermere-1", NODE_ENV: "production" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

copyFileSync(
  "src/project-news-fallback.json",
  "dist/worlds/rivermere/dist/client/project-news.json",
);
writeFileSync(
  "dist/worlds/rivermere/world.json",
  JSON.stringify(
    {
      world: "rivermere-1",
      seed: 57180908,
      generator: 1,
      metersPerUnit: 12,
      widthMeters: 100000,
      heightMeters: 100000,
      requiresSeparateDataDirectory: true,
    },
    null,
    2,
  ) + "\n",
);
