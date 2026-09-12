import { buildApplication } from "./build-pipeline.mjs";
await buildApplication({ incremental: process.argv.includes("--incremental") });
