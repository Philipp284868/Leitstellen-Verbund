import { build } from "esbuild";
import { serverBuildOptions } from "../server-build-options.mjs";
import { installFacilityCatalog } from "../geodata/install-facilities.mjs";
await build(serverBuildOptions("dist/server"));
installFacilityCatalog(process.cwd());
