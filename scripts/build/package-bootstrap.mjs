import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
if (process.platform !== "linux" || process.arch !== "x64")
  throw Error("Linux x64 erforderlich.");
const root = await mkdtemp(join(tmpdir(), "lv-bootstrap-"));
const sum = (b) => createHash("sha256").update(b).digest("hex");
try {
  const stage = join(root, "bootstrap");
  await mkdir(join(stage, "launcher"), { recursive: true });
  await build({
    entryPoints: ["ops/runtime/cli.mjs"],
    outfile: join(stage, "launcher/runtime.mjs"),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
  });
  const response = await fetch(
    "https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.gz",
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok) throw Error("Node-Download fehlgeschlagen.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    sum(bytes) !==
    "f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4"
  )
    throw Error("Node-Prüfsumme falsch.");
  await writeFile(join(root, "node.tar.gz"), bytes);
  execFileSync("tar", ["-xzf", join(root, "node.tar.gz"), "-C", root]);
  await mkdir(join(stage, "node/bin"), { recursive: true });
  await copyFile(
    join(root, "node-v24.19.0-linux-x64/bin/node"),
    join(stage, "node/bin/node"),
  );
  await copyFile(
    join(root, "node-v24.19.0-linux-x64/LICENSE"),
    join(stage, "node/LICENSE"),
  );
  const tar = join(root, "bootstrap.tar");
  execFileSync("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-cf",
    tar,
    "-C",
    stage,
    ".",
  ]);
  const archive = execFileSync("gzip", ["-n", "-9", "-c", tar], {
    maxBuffer: 128 * 1024 * 1024,
  });
  await mkdir(".tools/releases", { recursive: true });
  await writeFile(".tools/releases/amp-bootstrap.tar.gz", archive);
  await writeFile(
    ".tools/releases/bootstrap.json",
    JSON.stringify(
      {
        node: "24.19.0",
        nodeSha256: sum(bytes),
        archiveSha256: sum(archive),
        launcherSha256: sum(
          await readFile(join(stage, "launcher/runtime.mjs")),
        ),
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
