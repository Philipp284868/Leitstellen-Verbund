import { build } from "esbuild";
import { serverBuildOptions } from "./server-build-options.mjs";
const world =
  process.env.LV_BUILD_WORLD === "germany-1" ? "germany-1" : "rivermere-1";
await build(
  serverBuildOptions(
    world,
    world === "germany-1" ? "dist/germany/server" : "dist/server",
  ),
);
