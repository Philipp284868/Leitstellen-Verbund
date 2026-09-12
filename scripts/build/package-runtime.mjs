import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  lstat,
  readlink,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import "./check-build-provenance.mjs";
import {
  cleanRuntimeBookkeeping,
  pruneRuntimeDependencies,
  runtimeDependencies,
} from "./runtime-dependencies.mjs";
if (process.platform !== "linux")
  throw Error(
    "Das Serverpaket wird reproduzierbar unter Linux erstellt. Windows-PCs greifen per Browser zu.",
  );
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const info = JSON.parse(await readFile("dist/build-info.json", "utf8"));
if (
  info.commit !== commit ||
  info.dirty ||
  git("status", "--porcelain", "--untracked-files=normal")
)
  throw Error(
    "Sauberer Checkout und frischer Build desselben Commits erforderlich.",
  );
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const output = resolve(process.argv[2] || ".tools/releases");
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "lv-runtime-package-"));
const stage = join(temporary, "app");
await mkdir(stage);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  for (const file of [
    "dist",
    "package.json",
    "pnpm-lock.yaml",
    ".env.example",
    "Caddyfile.example",
    "docs/LIZENZEN.md",
    "config/baseline.sql",
    "config/migrations",
    "ops/runtime",
    "data/facilities/manifest.json",
    "scripts/start-germany.mjs",
    "scripts/facilities-maintenance.mjs",
    "scripts/configuration.mjs",
    "scripts/installation-storage.mjs",
    "scripts/installation.mjs",
    "scripts/network-check.mjs",
    "scripts/diagnose.mjs",
    "scripts/geodata/pipeline.mjs",
    "scripts/geodata/download-package.mjs",
    "scripts/geodata/download-manifest.json",
    "scripts/geodata/router-arguments.mjs",
  ])
    await cp(file, join(stage, file), {
      recursive: true,
      // Ignored Python caches contain machine paths and timestamped bytecode;
      // they must not make an otherwise clean release non-reproducible.
      filter: (path) =>
        !/\.map$|(?:^|[\\/])__pycache__(?:[\\/]|$)|\.py[co]$/.test(path),
    });
  execFileSync(
    process.execPath,
    [
      resolve(".tools/pnpm-11.19.0/bin/pnpm.cjs"),
      "--dir",
      stage,
      "install",
      "--prod",
      "--frozen-lockfile",
      "--ignore-scripts",
    ],
    { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } },
  );
  // Remove machine-specific metadata and generated dependency CLI wrappers;
  // preserve the dependency modules, their bin source files and package links.
  await cleanRuntimeBookkeeping(stage);
  await pruneRuntimeDependencies(stage);
  await rm(join(stage, "dist/server/lab-cli.js"), { force: true });
  await writeFile(
    join(stage, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        type: "module",
        engines: pkg.engines,
        dependencies: Object.fromEntries(
          runtimeDependencies.map((name) => [name, pkg.dependencies[name]]),
        ),
      },
      null,
      2,
    ),
  );
  const files = [];
  // Runtime legal references must remain usable without shipping the development wiki.
  const legal = join(stage, "docs/LIZENZEN.md");
  await writeFile(
    legal,
    (await readFile(legal, "utf8")).replace(
      /\]\(([A-Z][A-Z0-9-]*\.md)\)/g,
      `](https://github.com/Philipp284868/Leitstellen-Verbund/blob/${commit}/docs/$1)`,
    ),
  );
  async function inventory(folder, prefix = "") {
    for (const name of (await readdir(folder)).sort()) {
      const path = join(folder, name),
        relative = prefix + name;
      const stat = await lstat(path);
      if (stat.isFile() && name.endsWith(".map")) {
        await rm(path);
        continue;
      }
      if (stat.isSymbolicLink())
        files.push({ path: relative, link: await readlink(path) });
      else if (stat.isDirectory()) await inventory(path, relative + "/");
      else if (stat.isFile())
        files.push({ path: relative, sha256: hash(await readFile(path)) });
      else throw Error("Unerwarteter Dateityp: " + relative);
    }
  }
  await inventory(stage);
  await writeFile(
    join(stage, "release.json"),
    JSON.stringify(
      {
        format: 2,
        compatibility: { database: 26, minimumDatabase: 25, geodata: 1 },
        version: pkg.version,
        commit,
        product: "germany-1",
        buildHash: info.outputs,
        node: "24.x",
        platform: "linux-x64",
        files,
      },
      null,
      2,
    ) + "\n",
  );
  const stem = `leitstellen-verbund-${pkg.version}-linux-runtime`;
  const tar = join(temporary, "runtime.tar");
  execFileSync(
    "tar",
    [
      "--sort=name",
      `--mtime=@${git("show", "-s", "--format=%ct", commit)}`,
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--format=gnu",
      "-cf",
      tar,
      "-C",
      stage,
      ".",
    ],
    { stdio: "inherit" },
  );
  // gzip -n omits archive filename and creation time. Equal inputs produce equal bytes.
  const gzip = execFileSync("gzip", ["-n", "-9", "-c", tar], {
    maxBuffer: 256 * 1024 * 1024,
  });
  await writeFile(join(output, stem + ".tar.gz"), gzip);
  await writeFile(
    join(output, "SHA256SUMS"),
    hash(gzip) + "  " + stem + ".tar.gz\n",
  );
  await cp(join(stage, "release.json"), join(output, "release.json"));
  console.log(
    JSON.stringify({
      commit,
      archive: join(output, stem + ".tar.gz"),
      sha256: hash(gzip),
      files: files.length,
    }),
  );
} finally {
  // The absolute target comes directly from mkdtemp, outside the checkout and user data.
  await rm(temporary, { recursive: true, force: true });
}
