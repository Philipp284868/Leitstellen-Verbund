import { chromium, expect } from "@playwright/test";
import { fork, spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { cpus, totalmem } from "node:os";
const args = process.argv.slice(2),
  value = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
if (args.includes("--help")) {
  console.log(
    "bench:dev [--world germany-1|rivermere-1] [--label name] [--channel msedge] [--cwd isolated-checkout]\nAlternativ: --command build|build:fast|test:quick|test:unit|test:ci|check:quick. Jeder Aufruf misst einen Lauf; Cachezustand im Bericht angeben. Kein Löschen von Caches, Daten oder vorhandenen Quellen.",
  );
  process.exit(0);
}
const cwd = resolve(value("--cwd", ".")),
  label = value("--label", "latest");
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error("Ungültiger Messname.");
const out = resolve(".tools/bench", label);
await mkdir(out, { recursive: true });
const pkg = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8"));
if (pkg.name !== "leitstellen-verbund") throw Error("Kein Projektcheckout.");
let commit = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  /* archived source provenance supplied by the caller */
}
const report = {
  commit,
  cwd,
  node: process.version,
  platform: process.platform,
  cpu: cpus()[0].model,
  cores: cpus().length,
  ram: totalmem(),
  startedAt: new Date().toISOString(),
  command: value("--command", "dev"),
  cache: "preserved; caller records cold/warm preparation",
};
let log = "";
if (args.includes("--command")) {
  if (
    ![
      "build",
      "build:fast",
      "test:quick",
      "test:unit",
      "test:ci",
      "check:quick",
    ].includes(report.command)
  )
    throw Error("Unbekannter Messbefehl.");
  const before = performance.now();
  report.exit = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(".tools/pnpm-11.19.0/bin/pnpm.cjs"), report.command],
      {
        cwd,
        env: { ...process.env, LV_OFFLINE_NEWS: "1" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (b) => (log += b));
    child.stderr.on("data", (b) => (log += b));
    child.once("error", reject);
    child.once("exit", done);
  });
  report.durationMs = Math.round(performance.now() - before);
} else {
  async function port() {
    const server = createServer();
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const value = server.address().port;
    await new Promise((done) => server.close(done));
    return value;
  }
  const frontend = await port(),
    backend = await port(),
    world = value("--world", process.env.LV_BUILD_WORLD || "germany-1");
  const browser = await chromium.launch({
    channel: value(
      "--channel",
      process.env.PW_EDGE === "1" ? "msedge" : undefined,
    ),
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const name = `lv-bench-${randomUUID()}.css`,
    file = resolve(cwd, "src", name),
    content = ":root { --lv-benchmark: 0; }\n";
  await writeFile(file, content, { flag: "wx" });
  const before = performance.now(),
    child = fork(resolve(cwd, "scripts/dev.mjs"), [], {
      cwd,
      env: {
        ...process.env,
        LV_BUILD_WORLD: world,
        DEV_PORT: String(frontend),
        DEV_API_PORT: String(backend),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
  const exit = new Promise((done) => child.once("exit", done));
  child.stdout.on("data", (b) => (log += b));
  child.stderr.on("data", (b) => (log += b));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null)
            throw Error("Entwicklungsstart fehlgeschlagen: " + log);
          try {
            return (await fetch(`http://127.0.0.1:${frontend}/api/health`))
              .status;
          } catch {
            return 0;
          }
        },
        { timeout: 45000 },
      )
      .toBe(200);
    await page.goto(`http://127.0.0.1:${frontend}`);
    await expect(
      page.getByRole("textbox", { name: "Benutzername", exact: true }),
    ).toBeVisible({ timeout: 45000 });
    await expect(
      page.getByText("Server erreichbar", { exact: true }),
    ).toBeVisible();
    report.usableLoginMs = Math.round(performance.now() - before);
    await page.evaluate((path) => import(path), `/src/${name}?import`);
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--lv-benchmark")
          .trim() === "0",
    );
    const origin = await page.evaluate(() => performance.timeOrigin),
      edit = performance.now();
    await writeFile(file, content.replace(": 0", ": 1"));
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--lv-benchmark")
          .trim() === "1",
    );
    report.hmrMs = Math.round(performance.now() - edit);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    expect(errors).toEqual([]);
    report.errors = errors;
    await page.screenshot({ path: resolve(out, "dev-login.png") });
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (child.connected)
      child.send("stop", () => {
        if (child.connected) child.disconnect();
      });
    report.exit = await exit;
    // This unique file was created by this process; existing sources are untouched.
    await unlink(file);
  }
}
await writeFile(resolve(out, "log.txt"), log);
await writeFile(resolve(out, "metrics.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.exit !== 0) process.exitCode = 1;
