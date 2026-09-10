import { DatabaseSync, backup } from "node:sqlite";
import { mkdtemp, chmod, link, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";

export const RETIRED_FORMAT = {
  version: 1,
  worlds: ["falkenried-1", "falkenried-2", "rivermere-1"],
} as const;
/** Read-only preservation bridge; never instantiates the old game or converts positions. */
export function inspectRetiredDatabase(db: DatabaseSync) {
  if (db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok")
    throw Error(
      "Altbestand beschädigt; keine Konvertierung oder Reparatur vorgenommen.",
    );
  const worlds = new Set<string>();
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String(r.name)),
  );
  if (tables.has("meta")) {
    const identity = db
      .prepare("SELECT value FROM meta WHERE key='world-identity-v1'")
      .get();
    if (identity) worlds.add(String(JSON.parse(String(identity.value)).world));
  }
  for (const table of ["saves", "solo_saves"])
    if (tables.has(table))
      for (const row of db.prepare(`SELECT data FROM ${table}`).iterate())
        worlds.add(String(JSON.parse(String(row.data)).world));
  if (
    !worlds.size ||
    [...worlds].some((w) => !RETIRED_FORMAT.worlds.some((known) => known === w))
  )
    throw Error(
      "Kein eindeutig unterstützter fiktiver Altbestand. Für Deutschland den regulären Backup-Befehl verwenden.",
    );
  return {
    format: RETIRED_FORMAT.version,
    worlds: [...worlds].sort(),
    schema: Number(db.prepare("PRAGMA user_version").get()!.user_version),
    conflict:
      "Fiktive Koordinaten besitzen keine verlässliche Deutschland-Zuordnung. Der gesamte Originalbestand wird ohne Datenumrechnung gesichert.",
  };
}
export async function exportRetiredDatabase(
  source: string,
  destination: string,
) {
  const path = resolve(source, "game.sqlite"),
    output = resolve(destination);
  if (!output.endsWith(".sqlite"))
    throw Error("Ziel muss eine neue .sqlite-Sicherung sein.");
  const db = new DatabaseSync(path, { readOnly: true });
  let temporary: string | undefined;
  try {
    const report = inspectRetiredDatabase(db);
    temporary = await mkdtemp(join(dirname(output), ".retired-export-"));
    const staged = join(temporary, "snapshot.sqlite");
    await backup(db, staged);
    await chmod(staged, 0o600);
    // Atomic no-overwrite publication. An existing path or link always fails.
    await link(staged, output);
    return { ...report, file: output };
  } finally {
    db.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
