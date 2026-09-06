import { openSync, closeSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
export function acquireLock(dir: string) {
  const path = resolve(dir, "server.lock");
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    throw Error(
      "Datenverzeichnis bereits gesperrt. Server/Administration zuerst stoppen; bei Absturz siehe docs/AMP.md.",
    );
  }
  try {
    writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
    );
  } finally {
    closeSync(fd);
  }
  return () => unlinkSync(path);
}
