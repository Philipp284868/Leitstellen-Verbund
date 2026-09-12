import { lstat, readdir, rm, readFile, realpath } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

export const runtimeDependencies = [
  "@mapbox/vector-tile",
  "pbf",
  "socket.io",
  "zod",
];

// Retain the installed, lockfile-resolved closure; never resolve a fresh dependency version.
export async function pruneRuntimeDependencies(stage) {
  const modules = resolve(stage, "node_modules"),
    store = join(modules, ".pnpm"),
    keep = new Set();
  async function visit(path) {
    path = await realpath(path);
    if (!path.startsWith(store + sep))
      throw Error("Dependency outside package store.");
    const entry = path.slice(store.length + 1).split(sep)[0];
    if (keep.has(entry)) return;
    keep.add(entry);
    const pkg = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
    for (const name of new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ])) {
      // pnpm places dependency links beside the installed package, including scoped packages.
      const siblings =
        path.slice(0, path.lastIndexOf(sep + "node_modules")) +
        sep +
        "node_modules";
      const dependency = join(siblings, name);
      try {
        await lstat(dependency);
      } catch (e) {
        if (e.code === "ENOENT" && pkg.optionalDependencies?.[name]) continue;
        throw e;
      }
      await visit(dependency);
    }
  }
  for (const name of runtimeDependencies) await visit(join(modules, name));
  for (const entry of await readdir(store))
    if (
      entry !== "node_modules" &&
      (await lstat(join(store, entry))).isDirectory() &&
      !keep.has(entry)
    )
      await rm(join(store, entry), { recursive: true });
  async function clean(path) {
    for (const entry of await readdir(path)) {
      const child = join(path, entry),
        stat = await lstat(child);
      if (stat.isSymbolicLink()) {
        try {
          await realpath(child);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
          await rm(child);
        }
      } else if (stat.isDirectory()) {
        if (
          ["test", "tests", "__tests__", "test-results", "coverage"].includes(
            entry,
          )
        )
          await rm(child, { recursive: true });
        else await clean(child);
      }
    }
  }
  await clean(modules);
}

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
