import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contractHash, sameSet } from "./ci-contract.mjs";
import { runCommand } from "./ci-process.mjs";
import { vitestResults, browserResults } from "./ci-results.mjs";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
export async function runGroup(group, part) {
  const plan = read(".tools/ci/plan.json");
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (
    plan.head !== head ||
    plan.contract !== contractHash ||
    !plan.expected.includes(group)
  )
    throw Error("Falscher Commit, Vertrag oder nicht geplante Gruppe.");
  const selected =
    part === undefined ? plan.selected[group] : plan.partitions[group]?.[part];
  if (!selected?.length) throw Error("Leerer oder unbekannter Prüfteil.");
  const id = group + (part === undefined ? "" : "-" + part),
    started = performance.now();
  mkdirSync(".tools/ci/results", { recursive: true });
  mkdirSync(".tools/test-runs", { recursive: true });
  const result = {
    group,
    part,
    head,
    contract: contractHash,
    status: "failure",
    executed: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    commands: [],
  };
  const run = async (args, env, exe) =>
    result.commands.push(await runCommand(args, env, exe));
  const pnpm = (...args) => run([".tools/pnpm-11.19.0/bin/pnpm.cjs", ...args]);
  async function browser(engine, files, suffix) {
    const output = resolve(".tools/test-runs/" + suffix + ".json");
    await run(
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        ...files,
        "--project=" + engine,
        "--workers=" + (group === "endurance" ? 1 : 2),
        "--reporter=line,json",
        "--output=.tools/ci/browser-output/" + suffix,
      ],
      { PLAYWRIGHT_JSON_OUTPUT_NAME: output },
    );
    return browserResults(read(output), engine);
  }
  try {
    if (group === "structure") {
      await run(["scripts/check-project.mjs"]);
      await run(["scripts/check-format.mjs"]);
      if (selected.includes("lint")) await pnpm("lint");
    } else if (group === "build") {
      await run(["scripts/build.mjs"]);
      await run(["scripts/check-build-provenance.mjs"]);
      result.outputHash = read("dist/build-info.json").outputs;
    } else if (group === "logic") {
      const output = ".tools/test-runs/logic.json";
      await run([
        "node_modules/vitest/vitest.mjs",
        "run",
        "--maxWorkers=2",
        "--reporter=default",
        "--reporter=json",
        "--outputFile=" + output,
        ...selected,
      ]);
      Object.assign(result, vitestResults(read(output)));
    } else if (group === "node") {
      const output = ".tools/test-runs/node.json";
      await run([
        "--test",
        "--test-reporter=spec",
        "--test-reporter-destination=stdout",
        "--test-reporter=./scripts/node-test-reporter.mjs",
        "--test-reporter-destination=" + output,
        ...selected,
      ]);
      Object.assign(result, read(output));
    } else if (["chromium", "firefox"].includes(group))
      Object.assign(result, await browser(group, selected, id));
    else if (group === "endurance") {
      for (const engine of ["chromium", "firefox"]) {
        const files = selected
          .filter((f) => f.startsWith(engine + ":"))
          .map((f) => f.slice(engine.length + 1));
        const r = await browser(engine, files, "endurance-" + engine);
        result.executed.push(...r.executed.map((f) => engine + ":" + f));
        for (const key of ["passed", "failed", "skipped", "flaky"])
          result[key] += r[key];
        result.tests = [
          ...(result.tests ?? []),
          ...r.tests.map((t) => ({ ...t, engine })),
        ];
      }
    } else if (group === "geodata") {
      await run(["scripts/geodata/pipeline.mjs", "tools"]);
      await run(["scripts/geodata/test-tools.mjs"]);
      await run(["scripts/geodata/test-index.mjs"]);
      await run(
        [
          "-m",
          "pip",
          "install",
          "--require-hashes",
          "--only-binary=:all:",
          "--target",
          resolve(process.env.GEODATA_DIR, "tools/dem-python"),
          "-r",
          "scripts/geodata/dem/requirements.lock",
        ],
        undefined,
        "python",
      );
      await run(["scripts/geodata/dem/test_dem.py"], undefined, "python");
    } else if (group === "audit")
      await pnpm("audit", "--prod", "--audit-level=high");
    else if (group === "package") {
      await run(["scripts/check-build-provenance.mjs"]);
      await run(["scripts/package-runtime.mjs"]);
      const first = readFileSync(".tools/releases/SHA256SUMS", "utf8");
      await run(["scripts/package-runtime.mjs"]);
      if (first !== readFileSync(".tools/releases/SHA256SUMS", "utf8"))
        throw Error("Paket nicht reproduzierbar.");
      const archives = readdirSync(".tools/releases").filter((f) =>
        f.endsWith(".tar.gz"),
      );
      if (archives.length !== 1)
        throw Error("Genau ein Runtime-Paket erforderlich.");
      const archive = ".tools/releases/" + archives[0];
      await run(["scripts/runtime-smoke.mjs", archive]);
      result.archiveHash = createHash("sha256")
        .update(readFileSync(archive))
        .digest("hex");
      result.archive = archives[0];
      result.buildHash = read("dist/build-info.json").outputs;
    } else throw Error("Unbekannte Prüfgruppe.");
    if (
      !["logic", "node", "chromium", "firefox", "endurance"].includes(group)
    ) {
      result.executed = [...selected];
      result.passed = selected.length;
    }
    if (
      !sameSet(selected, result.executed) ||
      !result.passed ||
      result.failed ||
      result.skipped ||
      result.flaky
    )
      throw Error("Prüfumfang unvollständig oder fehlgeschlagen.");
    result.status = "success";
  } catch (error) {
    result.error = String(error);
    process.exitCode = 1;
  } finally {
    result.durationMs = Math.round(performance.now() - started);
    writeFileSync(
      ".tools/ci/results/" + id + ".json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        group,
        part,
        status: result.status,
        passed: result.passed,
        error: result.error,
        durationMs: result.durationMs,
      }),
    );
  }
  return result;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await runGroup(
    process.argv[2],
    process.argv[3] === undefined ? undefined : Number(process.argv[3]),
  );
