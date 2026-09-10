import { build } from "esbuild";
import { serverBuildOptions } from "./server-build-options.mjs";
await build(serverBuildOptions("dist/server"));
