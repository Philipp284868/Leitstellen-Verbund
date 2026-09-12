import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fingerprint, cachedBuild } from "./build-cache.mjs";
import { assertBuildPaths } from "./build-paths.mjs";
import { clean } from "./clean.mjs";
import { sourceGraph } from "./source-graph.mjs";

export async function buildApplication({ incremental = false } = {}) {
  const root = resolve("."),
    started = performance.now(),
    results = [];
  const run = (args) =>
    new Promise((done, reject) => {
      const child = spawn(process.execPath, args, {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: "production",
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
  if (existsSync("dist/germany")) await clean(root, ["dist/germany"], true);
  await mkdir(".tools/cache", { recursive: true });
  const commonInputs = [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "scripts/build-pipeline.mjs",
    "scripts/build-cache.mjs",
    "scripts/source-graph.mjs",
    "CHANGELOG.md",
    "src/changelog.ts",
    "scripts/build-changelog.mjs",
    ...[
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ].filter(existsSync),
  ];
  const env = Object.fromEntries(
    Object.entries(process.env)
      .filter(([k]) => k.startsWith("VITE_"))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const tasks = [
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
  for (const kind of ["client", "server"]) {
    const output = `dist/${kind}`;
    const name = "germany-1-" + kind;
    const inputs = await fingerprint(root, [
      ...new Set([
        ...commonInputs,
        ...sourceGraph(
          kind === "client"
            ? ["src/main.tsx"]
            : ["server/index.ts", "server/cli.ts", "server/lab-cli.ts"],
        ),
        ...(kind === "client"
          ? ["public", "vite.config.ts", "index.html"]
          : [
              "scripts/server-build-options.mjs",
              "scripts/build-server.mjs",
              "scripts/geodata/install-facilities.mjs",
              "data/facilities",
            ]),
      ]),
    ]);
    const key = JSON.stringify({
      schema: 2,
      inputs,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      world: "germany-1",
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
    await run(["scripts/build-changelog.mjs"]);
    await run(["scripts/check-bundles.mjs"]);
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
      JSON.stringify(
        {
          schema: 2,
          world: "germany-1",
          commit,
          dirty,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          outputs: await fingerprint(root, ["dist/client", "dist/server"]),
        },
        null,
        2,
      ) + "\n",
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
