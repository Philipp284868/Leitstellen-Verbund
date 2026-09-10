import {
  openSync,
  closeSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { resolve } from "node:path";
export function acquireLock(dir: string) {
  // The configuration reader is deliberately pure. Create a validated new data
  // directory only when the server or an explicit maintenance operation opens it.
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw Error(
      `Spieldatenordner kann nicht angelegt werden (${(error as NodeJS.ErrnoException).code}): ${dir}. Pfad und Schreibrechte prüfen.`,
    );
  }
  const path = resolve(dir, "server.lock");
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
      throw Error(
        `Spieldatenordner nicht beschreibbar (${(error as NodeJS.ErrnoException).code}): ${dir}. Dateisystem und Rechte prüfen.`,
      );
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
