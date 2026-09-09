import { buildApplication } from "./build-pipeline.mjs";
// Separate output preserves existing world identities and deployment entry points.
await buildApplication({
  worlds: ["germany-1"],
  incremental: process.argv.includes("--incremental"),
  skipTypecheck: process.argv.includes("--skip-typecheck"),
});
