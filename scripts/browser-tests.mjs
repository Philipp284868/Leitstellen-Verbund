import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2),
  started = performance.now(),
  reports = [];
const target =
  process.env.PLAYWRIGHT_JSON_OUTPUT_FILE || ".tools/test-runs/browser.json";
for (const phase of ["normal", "load"]) {
  const output = target.replace(/\.json$/, `-${phase}.json`);
  const command = [
    ".tools/pnpm-11.19.0/bin/pnpm.cjs",
    "exec",
    "playwright",
    "test",
    ...args,
    ...(phase === "load"
      ? ["--grep", "@load", "--workers=1"]
      : ["--grep-invert", "@load"]),
    "--output",
    `test-results/${phase}`,
  ];
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, command, {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: output,
        PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${phase}`,
      },
    });
    child.once("error", reject);
    child.once("exit", done);
  });
  if (code !== 0) process.exitCode = code || 1;
  reports.push(JSON.parse(await readFile(output, "utf8")));
}
const total = {
  duration: Math.round(performance.now() - started),
  expected: 0,
  unexpected: 0,
  skipped: 0,
  flaky: 0,
};
for (const report of reports)
  for (const key of ["expected", "unexpected", "skipped", "flaky"])
    total[key] += report.stats[key];
await mkdir(".tools/test-runs", { recursive: true });
await writeFile(
  target,
  JSON.stringify({ stats: total, phases: ["normal", "load"] }, null, 2),
);
console.log(
  "Vollständige Browserprüfung einschließlich isolierter Lastmessung: " +
    JSON.stringify(total),
);
