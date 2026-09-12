import {
  constants,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const read = (path) => JSON.parse(readFileSync(path, "utf8"));
export function within(root, path) {
  const r = relative(root, path);
  return r !== ".." && !r.startsWith(".." + sep) && !isAbsolute(r);
}
// Check every existing ancestor, not just the leaf. Never follow a mount/symlink while cleaning.
export function safePath(root, path = root) {
  if (
    typeof root !== "string" ||
    !root.trim() ||
    typeof path !== "string" ||
    !path.trim()
  )
    throw Error("Leerer Instanzpfad.");
  root = resolve(root);
  path = resolve(path);
  if (dirname(root) === root || !within(root, path))
    throw Error("Unsicherer Instanzpfad.");
  let p = path;
  while (true) {
    if (lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink())
      throw Error("Symlink im Instanzpfad: " + p);
    if (dirname(p) === p) break;
    p = dirname(p);
  }
  return path;
}
export function directory(path) {
  safePath(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return realpathSync(path);
}
export function syncDir(path) {
  if (process.platform === "win32") return;
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function atomic(path, value) {
  safePath(dirname(path), path);
  const temp = path + "." + randomUUID() + ".tmp";
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(
      fd,
      typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
    );
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  syncDir(dirname(path));
}
export function assertSpace(path, bytes) {
  const s = statfsSync(path);
  if (s.bavail * s.bsize < bytes)
    throw Error(
      "Zu wenig freier Speicher für Paket, Sicherung und Aktivierung.",
    );
}
export function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw Error("Ungültige Prozesssperre.");
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") return false;
    throw Error("Prozessrechte unklar; Sperre bleibt erhalten.");
  }
}
export function lock(path, action) {
  safePath(dirname(path), path);
  // No blind unlink on start/update. Recovery is an explicit maintenance action.
  const fd = openSync(path, "wx", 0o600);
  const token = randomUUID();
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, token, action }));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return () => {
    if (read(path).token !== token) throw Error("Instanzsperre verändert.");
    unlinkSync(path);
    syncDir(dirname(path));
  };
}
export function unlock(path) {
  safePath(dirname(path), path);
  if (!existsSync(path)) return;
  const before = readFileSync(path, "utf8"),
    p = JSON.parse(before);
  if (alive(p.pid))
    throw Error("Prozess existiert noch. Sperre bleibt erhalten.");
  if (readFileSync(path, "utf8") !== before)
    throw Error("Sperre wurde verändert.");
  unlinkSync(path);
  syncDir(dirname(path));
}
export function removeManaged(root, target) {
  target = safePath(root, target);
  if (target === resolve(root))
    throw Error("Verwaltete Wurzel wird nicht gelöscht.");
  const device = lstatSync(root).dev;
  function inspect(p) {
    const s = lstatSync(p);
    if (s.isSymbolicLink()) return; // Remove the link itself; never traverse its target.
    if (
      s.dev !== device ||
      (!s.isDirectory() && (!s.isFile() || s.nlink !== 1))
    )
      throw Error(
        "Fremdes Mount oder verknüpfte Datei; Aufräumen abgebrochen.",
      );
    if (s.isDirectory()) for (const n of readdirSync(p)) inspect(resolve(p, n));
  }
  inspect(target);
  rmSync(target, { recursive: true });
}
