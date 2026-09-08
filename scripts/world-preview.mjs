import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const path = resolve(process.argv[2] || "");
if (!process.argv[2] || !existsSync(path))
  throw Error(
    "Aufruf: node scripts/world-preview.mjs /absoluter/pfad/game.sqlite",
  );
const db = new DatabaseSync(path, { readOnly: true });
try {
  const result = {
    database: path,
    schema: Number(db.prepare("PRAGMA user_version").get().user_version),
    target: "rivermere-1",
    changesToPositions: 0,
    worlds: [],
    buildings: 0,
    vehicles: 0,
    activeTrips: 0,
    activeIncidents: 0,
  };
  const worlds = new Set();
  if (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'",
      )
      .get()
  ) {
    const identity = db
      .prepare("SELECT value FROM meta WHERE key='world-identity-v1'")
      .get();
    if (identity) worlds.add(JSON.parse(identity.value).world);
  }
  for (const table of ["saves", "solo_saves"]) {
    if (
      !db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)
    )
      continue;
    for (const row of db.prepare(`SELECT data FROM ${table}`).all()) {
      const s = JSON.parse(row.data);
      worlds.add(s.world);
      result.buildings += (s.buildings || []).length;
      result.vehicles += (s.vehicles || []).length;
      result.activeTrips += (s.vehicles || []).filter((v) =>
        ["travel", "return", "transport"].includes(v.status),
      ).length;
      result.activeIncidents += (s.missions || []).filter(
        (m) => m.phase !== "done",
      ).length;
    }
  }
  result.worlds = [...worlds];
  console.log(
    JSON.stringify(
      {
        ...result,
        compatible: result.worlds.every((w) => w === "rivermere-1"),
        action: result.worlds.some((w) => w !== "rivermere-1")
          ? "Bestandswelt behalten; Rivermere mit eigenem leeren Datenverzeichnis starten. Kein verlustfreier geografischer Transfer möglich."
          : "Weltkennung vor Start prüfen; kein Besitztransfer erforderlich.",
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
