import {
  lstat,
  readdir,
  readFile,
  realpath,
  unlink,
  rmdir,
} from "node:fs/promises";
import { resolve, relative, sep, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const CLEAN_TARGETS = [
  "dist",
  "test-results",
  "playwright-report",
  ".tools/cache",
];
const protectedName =
  /(?:^\.env(?:\.|$)|\.(?:sqlite(?:-.*)?|db|bak|pem|key)$|^(?:backups?|saves?|game|credentials|secrets?|admin-konto|server\.lock)(?:[.-]|$))/i;
const inside = (root, path) => {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    !isAbsolute(rel) &&
    rel !== ".." &&
    !rel.startsWith(".." + sep)
  );
};

export async function planClean(root, targets = CLEAN_TARGETS) {
  root = await realpath(root);
  if (
    JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).name !==
    "leitstellen-verbund"
  )
    throw Error("Kein Leitstellen-Verbund-Projekt.");
  const plan = [];
  for (const name of targets)
    if (![...CLEAN_TARGETS, "dist/worlds"].includes(name))
      throw Error(`Nicht freigegebenes Ausgabeziel: ${name}`);
  const selected = [...new Set(targets)].filter(
    (name) =>
      !targets.some(
        (parent) => name !== parent && name.startsWith(parent + "/"),
      ),
  );
  async function visit(path) {
    if (!inside(root, path))
      throw Error(`Geschützter Bereinigungspfad: ${path}`);
    const info = await lstat(path);
    if (
      (info.isDirectory() &&
        /^(?:backups?|saves?|secrets?)$/i.test(basename(path))) ||
      (!info.isDirectory() && protectedName.test(basename(path)))
    )
      throw Error(`Geschützter Bereinigungspfad: ${path}`);
    if (info.isSymbolicLink() || !inside(root, await realpath(path)))
      throw Error(`Verknüpfter Bereinigungspfad: ${path}`);
    if (info.isDirectory())
      for (const child of (await readdir(path)).sort())
        await visit(resolve(path, child));
    else if (!info.isFile() || info.nlink > 1)
      throw Error(`Unzulässiger Dateityp/Hardlink: ${path}`);
    plan.push({
      path,
      directory: info.isDirectory(),
      size: info.size,
      ino: info.ino,
      mtimeMs: info.mtimeMs,
    });
  }
  for (const name of selected) {
    // Check every ancestor, including .tools; never follow a junction to another root.
    let part = root;
    for (const component of name.split("/")) {
      part = resolve(part, component);
      try {
        if ((await lstat(part)).isSymbolicLink())
          throw Error(`Verknüpfter Bereinigungspfad: ${part}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    try {
      await visit(resolve(root, name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return plan;
}

export async function clean(root, targets, apply = false) {
  root = await realpath(root);
  const plan = await planClean(root, targets);
  if (!apply) return plan;
  // Fail closed if a file appeared or changed after the complete safety pass.
  const checked = await planClean(root, targets);
  if (JSON.stringify(plan) !== JSON.stringify(checked))
    throw Error("Ausgaben wurden während der Vorschau verändert.");
  for (const entry of plan) {
    const info = await lstat(entry.path);
    if (
      info.isSymbolicLink() ||
      info.ino !== entry.ino ||
      !inside(root, await realpath(entry.path))
    )
      throw Error("Bereinigungspfad wurde ersetzt.");
    // Non-recursive operations cannot traverse a swapped directory or junction.
    if (entry.directory) await rmdir(entry.path);
    else await unlink(entry.path);
  }
  return plan;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2),
    apply = args.includes("--apply"),
    targets = args.filter((x) => x !== "--apply");
  const plan = await clean(
    resolve("."),
    targets.length ? targets : CLEAN_TARGETS,
    apply,
  );
  console.log(
    JSON.stringify(
      {
        mode: apply ? "entfernt" : "Vorschau; zum Entfernen --apply ergänzen",
        files: plan.filter((x) => !x.directory).length,
        bytes: plan.filter((x) => !x.directory).reduce((n, x) => n + x.size, 0),
        targets: targets.length ? targets : CLEAN_TARGETS,
      },
      null,
      2,
    ),
  );
}
