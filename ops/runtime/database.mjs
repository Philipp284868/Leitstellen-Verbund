import { DatabaseSync, backup } from "node:sqlite";
import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  lstatSync,
  copyFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  assertSpace,
  atomic,
  directory,
  hash,
  safePath,
  syncDir,
} from "./files.mjs";

export function migrate(file, program, compatibility) {
  const before = inspect(file);
  if (
    before.schema > compatibility.database ||
    before.schema < compatibility.minimumDatabase
  )
    throw Error("Nicht unterstütztes Datenbankschema.");
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
    for (
      let version = before.schema + 1;
      version <= compatibility.database;
      version++
    ) {
      db.exec(
        readFileSync(
          resolve(
            program,
            "config/migrations",
            String(version).padStart(3, "0") + ".sql",
          ),
          "utf8",
        ),
      );
      db.exec("PRAGMA user_version=" + version);
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw Error("Migration verletzt Datenbeziehungen.");
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  return inspect(file);
}
export function restoreBeforeAdmission(i, saved) {
  safePath(i.root, saved.file);
  if (
    hash(readFileSync(saved.file)) !== saved.sha256 ||
    inspect(saved.file).generation !== i.record.generation
  )
    throw Error("Update-Sicherung beschädigt oder andere Weltgeneration.");
  const file = resolve(i.data, "game.sqlite"),
    db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
  const temp = resolve(i.data, "restore-before-admission.sqlite");
  if (existsSync(temp)) throw Error("Ungeklärte Wiederherstellung vorhanden.");
  copyFileSync(saved.file, temp);
  inspect(temp);
  const fd = openSync(temp, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
  syncDir(i.data);
}
export function inspect(file) {
  safePath(file);
  if (!existsSync(file))
    throw Error("Datenbank fehlt; keine Ersatzwelt angelegt.");
  if (lstatSync(file).nlink !== 1)
    throw Error("Verknüpfte Datenbank wird nicht verwendet.");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw Error("Datenbankprüfung fehlgeschlagen.");
    return {
      schema: Number(db.prepare("PRAGMA user_version").get().user_version),
      generation: db
        .prepare("SELECT value FROM meta WHERE key='instance-generation'")
        .get()?.value,
      accounts: Number(db.prepare("SELECT count(*) n FROM users").get().n),
    };
  } finally {
    db.close();
  }
}
export async function snapshot(file, target) {
  safePath(file);
  directory(resolve(target, ".."));
  safePath(target);
  assertSpace(
    resolve(target, ".."),
    statSync(file).size * 3 + 16 * 1024 * 1024,
  );
  if (existsSync(target)) throw Error("Sicherungsziel existiert bereits.");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    await backup(db, target);
  } finally {
    db.close();
  }
  chmodSync(target, 0o600);
  const details = inspect(target);
  const digest = hash(readFileSync(target));
  atomic(target + ".json", {
    ...details,
    sha256: digest,
    at: new Date().toISOString(),
  });
  return { ...details, sha256: digest, file: target };
}
export function fresh(
  i,
  program,
  target = i.data,
  generation = i.record.generation,
) {
  directory(target);
  const file = resolve(target, "game.sqlite");
  if (existsSync(file))
    throw Error("Neue Welt würde eine vorhandene Datenbank überschreiben.");
  const geo = JSON.parse(readFileSync(resolve(i.geo, "manifest.json"), "utf8"));
  if (
    geo.status !== "ready" ||
    geo.worldId !== "germany-1" ||
    !/^[a-f0-9]{64}$/.test(geo.dataset)
  )
    throw Error("Geodatenmanifest nicht bereit.");
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE;");
    db.exec(readFileSync(resolve(program, "config/baseline.sql"), "utf8"));
    const put = db.prepare(
      "INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)",
    );
    put.run(
      "world-identity-v1",
      JSON.stringify({ world: "germany-1", seed: 20260907, generator: 1 }),
    );
    put.run("geodata-dataset-v1", geo.dataset);
    put.run("instance-generation", generation);
    put.run("instance-id", i.record.id);
    put.run("lastTick", String(Date.now()));
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  chmodSync(file, 0o600);
  inspect(file);
  atomic(resolve(target, "world.json"), { instance: i.record.id, generation });
}
