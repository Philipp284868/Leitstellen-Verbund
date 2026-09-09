import { lstat, readdir, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

// Called only for the freshly installed, temporary runtime staging directory.
// pnpm's generated CLI shims embed that random directory in NODE_PATH. The
// bundled server starts directly with Node and never invokes dependency CLIs.
export async function cleanRuntimeBookkeeping(stage) {
  const modules = resolve(stage, "node_modules");
  if (
    !(await lstat(modules)).isDirectory() ||
    (await lstat(modules)).isSymbolicLink()
  )
    throw Error("Runtime-Abhängigkeiten müssen im eigenen Paketordner liegen.");
  async function removeLocal(path, recursive = false) {
    const target = resolve(path);
    if (!target.startsWith(modules + sep))
      throw Error("Runtime-Bereinigung außerhalb des Paketordners verweigert.");
    await rm(target, { recursive, force: true });
  }
  for (const file of [".modules.yaml", ".pnpm-workspace-state-v1.json"])
    await removeLocal(join(modules, file));
  async function visit(folder) {
    for (const name of await readdir(folder)) {
      const path = join(folder, name),
        stat = await lstat(path);
      // Never follow package links/junctions into another dependency or tree.
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
      if (name === ".bin" && basename(folder) === "node_modules")
        await removeLocal(path, true);
      else await visit(path);
    }
  }
  await visit(modules);
}
