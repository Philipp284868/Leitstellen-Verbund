import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { testGroups } from "./test-groups.mjs";
const stage = process.argv[2],
  groups = testGroups(),
  files = groups.all;
const pnpm = [".tools/pnpm-11.19.0/bin/pnpm.cjs"];
const quickNames = new Set([
  "audio",
  "ids",
  "storage",
  "performance",
  "project-news",
  "economy",
  "fleet-view",
  "device-preferences",
  "building-staffing",
  "build-tools",
]);
const vitest = (list, label) => ({
  args: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--maxWorkers=2",
    "--reporter=default",
    "--reporter=json",
    `--outputFile=.tools/test-runs/${stage}-${label}.json`,
    ...list,
  ],
  env: {
    LV_TEST_LEGACY: list.every((f) => groups.unit.includes(f)) ? "0" : "1",
  },
});
const regional = files.filter((f) => f.endsWith("/rivermere.test.ts"));
const logic = [
  vitest(
    files.filter((f) => !regional.includes(f)),
    "logic",
  ),
  vitest(regional, "region"),
  { args: ["--test", "tests/hard-reset.node.mjs"] },
];
const commands = {
  quick: [
    vitest(
      files.filter((f) =>
        quickNames.has(f.split("/").at(-1).replace(".test.ts", "")),
      ),
      "quick",
    ),
  ],
  unit: [vitest(groups.unit, "unit")],
  integration: [
    vitest(
      groups.integration.filter((f) => !regional.includes(f)),
      "integration",
    ),
    vitest(regional, "region"),
    { args: ["--test", "tests/hard-reset.node.mjs"] },
  ],
  ci: logic,
  full: [
    { args: ["scripts/build.mjs"] },
    { args: [...pnpm, "check:project"] },
    { args: [...pnpm, "lint"] },
    ...logic,
    { args: [...pnpm, "test:security"] },
    { args: [...pnpm, "test:e2e"] },
  ],
}[stage];
if (!commands)
  throw Error("Teststufe fehlt: quick, unit, integration, ci oder full");
const start = performance.now(),
  results = [];
mkdirSync(".tools/test-runs", { recursive: true });
try {
  // Complete the remaining independent groups after a failure, retaining failure status.
  // Full E2E cannot run against a failed build/check, so stop that delivery pipeline.
  for (const { args, env } of commands) {
    const before = performance.now();
    const code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, args, {
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, ...env },
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
      if (stage === "full") break;
    }
  }
} finally {
  const report = {
    stage,
    platform: process.platform,
    node: process.version,
    groups: { unit: groups.unit, integration: groups.integration },
    durationMs: Math.round(performance.now() - start),
    results,
  };
  writeFileSync(
    `.tools/test-runs/${stage}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      ...report,
      groups: {
        unit: groups.unit.length,
        integration: groups.integration.length,
      },
    }),
  );
}
