import { spawn } from "node:child_process";
import { readdirSync, mkdirSync } from "node:fs";
const args = process.argv.slice(2),
  deep = args.includes("--load");
const forwarded = args.filter((a) => a !== "--load");
const explicit = forwarded.filter((a) => a.endsWith(".spec.ts"));
const files = explicit.length
  ? []
  : readdirSync("tests/e2e")
      .filter(
        (f) =>
          f.endsWith(".spec.ts") &&
          (deep ? f === "map-load.spec.ts" : f !== "map-load.spec.ts"),
      )
      .map((f) => "tests/e2e/" + f);
if (!files.length && !explicit.length)
  throw Error("Keine Browserprüfungen ausgewählt.");
mkdirSync(".tools/test-runs", { recursive: true });
const child = spawn(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    ...files,
    ...forwarded,
    ...(deep ? ["--workers=1"] : []),
  ],
  { stdio: "inherit", windowsHide: true },
);
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
