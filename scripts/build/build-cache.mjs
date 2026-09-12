import { createHash } from "node:crypto";
import { readdir, readFile, lstat, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { assertBuildPaths } from "./build-paths.mjs";

// Build artifacts only. Test results are never cached. Verify every output byte.
export async function fingerprint(root, paths, exclude = []) {
  await assertBuildPaths(root, paths);
  const hash = createHash("sha256");
  async function visit(path) {
    const name = relative(root, path).replaceAll("\\", "/");
    if (exclude.includes(name)) return;
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw Error(`Verknüpfter Buildpfad: ${name}`);
    hash.update(name + "\0");
    if (info.isDirectory()) {
      for (const child of (await readdir(path)).sort())
        await visit(resolve(path, child));
    } else if (info.isFile()) hash.update(await readFile(path));
    else throw Error(`Unbekannter Builddateityp: ${name}`);
    hash.update("\0");
  }
  for (const path of [...paths].sort()) await visit(resolve(root, path));
  return hash.digest("hex");
}
export async function cachedBuild({
  root,
  name,
  key,
  outputs,
  exclude = [],
  reuse,
  run,
}) {
  const file = resolve(root, ".tools/cache/build", name + ".json");
  if (!/^[a-zA-Z0-9-]+$/.test(name)) throw Error("Ungültiger Artefaktname.");
  await assertBuildPaths(root, [file, ...outputs]);
  if (reuse) {
    try {
      const saved = JSON.parse(await readFile(file, "utf8"));
      if (
        saved.key === key &&
        saved.output === (await fingerprint(root, outputs, exclude))
      )
        return "verified-cache";
    } catch (error) {
      // Missing, incomplete, changed or unreadable artifacts are rebuilt.
      if (error?.message?.startsWith("Verknüpfter")) throw error;
    }
  }
  await run();
  const output = await fingerprint(root, outputs, exclude);
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify({ key, output }));
  return "built";
}
