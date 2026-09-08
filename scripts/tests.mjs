import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
const stage = process.argv[2];
const files = readdirSync("tests", { recursive: true })
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => "tests/" + f.replaceAll("\\", "/"));
const unitNames = new Set([
  "audio",
  "ids",
  "storage",
  "performance",
  "project-news",
]);
const unit = files.filter((f) =>
  unitNames.has(f.split("/").at(-1).replace(".test.ts", "")),
);
const integration = files.filter((f) => !unit.includes(f));
const pnpm = [".tools/pnpm-11.19.0/bin/pnpm.cjs"];
const vitest = (list) => [...pnpm, "exec", "vitest", "run", ...list];
const jobs = {
  quick: [[...pnpm, "typecheck"], vitest(unit)],
  unit: [vitest(unit)],
  integration: [vitest(integration), ["--test", "tests/hard-reset.node.mjs"]],
  ci: [vitest(files), ["--test", "tests/hard-reset.node.mjs"]],
  full: [
    [...pnpm, "build"],
    [...pnpm, "lint"],
    vitest(files),
    ["--test", "tests/hard-reset.node.mjs"],
    [...pnpm, "test:e2e"],
  ],
}[stage];
if (!jobs)
  throw Error("Teststufe fehlt: quick, unit, integration, ci oder full");
const start = performance.now(),
  results = [];
try {
  for (const args of jobs) {
    const before = performance.now();
    const code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, args, {
        stdio: "inherit",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("exit", done);
    });
    results.push({
      command: args.join(" "),
      ms: Math.round(performance.now() - before),
      exitCode: code,
    });
    if (code !== 0) {
      process.exitCode = code || 1;
      break;
    }
  }
} finally {
  const report = {
    stage,
    platform: process.platform,
    node: process.version,
    durationMs: Math.round(performance.now() - start),
    results,
  };
  mkdirSync(".tools/test-runs", { recursive: true });
  writeFileSync(
    `.tools/test-runs/${stage}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
