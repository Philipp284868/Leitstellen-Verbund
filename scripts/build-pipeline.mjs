import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fingerprint, cachedBuild } from "./build-cache.mjs";
import { assertBuildPaths } from "./build-paths.mjs";
import { clean } from "./clean.mjs";

export async function buildApplication({
  worlds = ["rivermere-1", "germany-1"],
  incremental = false,
  skipTypecheck = false,
} = {}) {
  const root = resolve("."),
    started = performance.now(),
    results = [];
  const run = (args, world) =>
    new Promise((done, reject) => {
      const child = spawn(process.execPath, args, {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: "production",
          LV_BUILD_WORLD: world ?? "rivermere-1",
        },
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? done()
          : reject(Error(`Build fehlgeschlagen (${code}): ${args.join(" ")}`)),
      );
    });
  await assertBuildPaths(root, ["dist", ".tools/cache"]);
  if (existsSync("dist/worlds")) await clean(root, ["dist/worlds"], true);
  await mkdir(".tools/cache", { recursive: true });
  const inputs = await fingerprint(root, [
    "src",
    "server",
    "public",
    "scripts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
    ...[
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ].filter(existsSync),
  ]);
  const env = Object.fromEntries(
    Object.entries(process.env)
      .filter(([k]) => k.startsWith("VITE_"))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const tasks = skipTypecheck
    ? []
    : [
        {
          name: "types",
          run: () =>
            run([
              "node_modules/typescript/bin/tsc",
              "--noEmit",
              ...(incremental
                ? [
                    "--incremental",
                    "--tsBuildInfoFile",
                    ".tools/cache/types.tsbuildinfo",
                  ]
                : []),
            ]),
        },
      ];
  for (const world of worlds)
    for (const kind of ["client", "server"]) {
      const output = `dist/${world === "germany-1" ? "germany/" : ""}${kind}`;
      const name = world + "-" + kind;
      const key = JSON.stringify({
        schema: 1,
        inputs,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        world,
        kind,
        env,
      });
      tasks.push({
        name,
        run: () =>
          cachedBuild({
            root,
            name,
            key,
            outputs: [output],
            exclude: [`${output}/project-news.json`],
            reuse: incremental,
            run: () =>
              run(
                kind === "client"
                  ? ["node_modules/vite/bin/vite.js", "build"]
                  : ["scripts/build-server.mjs"],
                world,
              ),
          }),
      });
    }
  // At most two compilers including tsc, also on standard CI runners.
  // Drain running work on failure before returning a non-zero result.
  let next = 0,
    failure;
  await Promise.all(
    [0, 1].map(async () => {
      while (!failure && next < tasks.length) {
        const task = tasks[next++],
          before = performance.now();
        try {
          results.push({
            name: task.name,
            result: (await task.run()) ?? "checked",
            ms: Math.round(performance.now() - before),
          });
        } catch (error) {
          failure = error;
          results.push({
            name: task.name,
            result: "failed",
            ms: Math.round(performance.now() - before),
          });
        }
      }
    }),
  );
  if (!failure) {
    await run(["scripts/sync-project-news.mjs"]);
    if (worlds.length === 2) await run(["scripts/check-bundles.mjs"]);
    let commit = null,
      dirty = true;
    try {
      const options = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
      commit = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
      dirty = Boolean(
        execFileSync(
          "git",
          ["status", "--porcelain", "--untracked-files=normal"],
          options,
        ).trim(),
      );
    } catch {
      /* ZIP installs have no Git provenance; release packaging requires it. */
    }
    await writeFile(
      "dist/build-info.json",
      JSON.stringify({ commit, dirty, node: process.version }, null, 2) + "\n",
    );
  }
  await mkdir(".tools/test-runs", { recursive: true });
  await writeFile(
    ".tools/test-runs/build.json",
    JSON.stringify(
      {
        incremental,
        node: process.version,
        platform: process.platform,
        durationMs: Math.round(performance.now() - started),
        results,
      },
      null,
      2,
    ),
  );
  if (failure) throw failure;
}
