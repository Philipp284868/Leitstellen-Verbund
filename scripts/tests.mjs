import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { testGroups } from "./test-groups.mjs";
import { makePlan, changedPaths } from "./ci-plan.mjs";
import { runCommand } from "./ci-process.mjs";
const stage = process.argv[2],
  groups = testGroups();
if (!["quick", "unit", "integration", "ci", "full"].includes(stage))
  throw Error("Teststufe fehlt: quick, unit, integration, ci oder full");
let files =
  stage === "unit"
    ? groups.unit
    : stage === "integration"
      ? groups.integration
      : groups.all;
let plan;
if (stage === "quick") {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const i = process.argv.indexOf("--base"),
    base = i < 0 ? process.env.CI_BASE : process.argv[i + 1];
  plan = await makePlan({ head, base, paths: changedPaths(base, head) });
  files = plan.selected.logic ?? [];
  console.log(
    "Auswahl: " +
      plan.profile +
      "; " +
      files.length +
      " Logikdateien. " +
      plan.reason,
  );
}
mkdirSync(".tools/test-runs", { recursive: true });
const started = performance.now(),
  results = [];
try {
  if (stage === "full") {
    results.push(await runCommand(["scripts/build.mjs"]));
    results.push(
      await runCommand([".tools/pnpm-11.19.0/bin/pnpm.cjs", "check:project"]),
    );
    results.push(
      await runCommand([".tools/pnpm-11.19.0/bin/pnpm.cjs", "lint"]),
    );
  }
  if (files.length)
    results.push(
      await runCommand([
        "node_modules/vitest/vitest.mjs",
        "run",
        "--maxWorkers=2",
        "--reporter=default",
        "--reporter=json",
        "--outputFile=.tools/test-runs/" + stage + "-logic.json",
        ...files,
      ]),
    );
  if (["ci", "full", "integration"].includes(stage))
    results.push(await runCommand(["--test", "tests/hard-reset.node.mjs"]));
  if (stage === "full") {
    results.push(
      await runCommand([".tools/pnpm-11.19.0/bin/pnpm.cjs", "test:security"]),
    );
    results.push(await runCommand(["scripts/browser-tests.mjs"]));
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(
    ".tools/test-runs/" + stage + ".json",
    JSON.stringify(
      {
        stage,
        plan,
        selected: files,
        status: process.exitCode ? "failure" : "success",
        durationMs: Math.round(performance.now() - started),
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
