import { lstat } from "node:fs/promises";
import { relative, resolve, isAbsolute, sep } from "node:path";
export async function assertBuildPaths(root, paths) {
  for (const path of paths) {
    const name = relative(root, resolve(root, path));
    if (
      !name ||
      isAbsolute(name) ||
      name === ".." ||
      name.startsWith(".." + sep)
    )
      throw Error("Buildpfad liegt außerhalb des Projekts.");
    let current = root;
    for (const part of name.split(sep)) {
      current = resolve(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw Error(
            `Buildverzeichnis darf nicht auf Datenordner verweisen: ${current}`,
          );
      } catch (error) {
        if (error.code === "ENOENT") break;
        throw error;
      }
    }
  }
}
