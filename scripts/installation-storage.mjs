import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { canonical, inside, present, regularFile } from "./configuration.mjs";

export const DATABASE_VERSION = 18;
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function atomicPrivate(file, bytes) {
  if (canonical(dirname(file)) !== dirname(file))
    throw Error(`Umgeleiteter Sicherungspfad: ${dirname(file)}`);
  regularFile(file);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
  if (process.platform !== "win32") {
    const directory = openSync(dirname(file), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
}
export function privateBackup(directory, name, bytes) {
  const file = resolve(directory, `${name}-${digest(bytes)}.bak`);
  if (present(file)) {
    regularFile(file);
    if (!readFileSync(file).equals(Buffer.from(bytes)))
      throw Error(
        `Sicherung stimmt nicht mit ihrem Fingerabdruck überein: ${file}`,
      );
  } else atomicPrivate(file, bytes);
  return file;
}
function readDatabase(file, inspect) {
  if (!regularFile(file)) throw Error(`Daten fehlen: ${file}`);
  // Do not let SQLite create shared-memory coordination files during diagnosis.
  if (existsSync(file + "-wal") && !existsSync(file + "-shm"))
    throw Error(
      `Datenbank mit unvollständigem WAL-Zustand: ${file}. Server sauber stoppen und Sicherung prüfen; keine automatische Reparatur.`,
    );
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return inspect(db);
  } finally {
    db.close();
  }
}
export function inspectGeodata(directory) {
  if (!present(directory) || !readdirSync(directory).length)
    return { status: "missing" };
  const file = resolve(directory, "manifest.json");
  regularFile(file);
  if (!existsSync(file))
    throw Error(
      `Geodatenpaket unvollständig: ${file} fehlt. Vorhandenen Ordner erhalten.`,
    );
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (
    manifest.schema !== 1 ||
    manifest.status !== "ready" ||
    manifest.worldId !== "germany-1" ||
    !/^[a-f0-9]{64}$/.test(manifest.dataset)
  )
    throw Error(`Geodatenmanifest ungültig oder falsche Welt: ${file}`);
  for (const [name, field] of [
    ["index.sqlite", "key"],
    ["maps.mbtiles", "name"],
  ]) {
    const dbFile = resolve(directory, name);
    if (existsSync(dbFile) && !inside(directory, canonical(dbFile)))
      throw Error(`Geodaten sind umgeleitet: ${name}`);
    readDatabase(dbFile, (db) => {
      const source = db
        .prepare(`SELECT value FROM metadata WHERE ${field}='source_sha256'`)
        .get();
      if (source?.value !== manifest.dataset)
        throw Error(`Geodatenkennung widerspricht Manifest: ${name}`);
      const table = name === "index.sqlite" ? "anchors" : "tiles";
      if (!db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())
        throw Error(`Geodatenbestand leer: ${name}`);
    });
  }
  return {
    status: "ready",
    dataset: manifest.dataset,
    manifestHash: digest(readFileSync(file)),
  };
}
export function inspectGame(directory, dataset) {
  if (!present(directory)) return { status: "empty" };
  const entries = readdirSync(directory).filter(
    (n) => n !== ".leitstellen-instance.json",
  );
  if (!entries.length) return { status: "empty" };
  const file = resolve(directory, "game.sqlite");
  if (!existsSync(file))
    throw Error(
      `Unbekannter nichtleerer Spielordner: ${directory}. Keine neue Welt anlegen; Daten prüfen.`,
    );
  return readDatabase(file, (db) => {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw Error(`Beschädigte Spieldatenbank: ${file}`);
    const version = Number(
      db.prepare("PRAGMA user_version").get().user_version,
    );
    if (version < 1 || version > DATABASE_VERSION)
      throw Error(`Nicht unterstütztes Datenbankschema ${version}: ${file}`);
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    for (const name of ["users", "saves", "meta", "sessions"])
      if (!tables.has(name))
        throw Error(`Fremde Datenbank, Tabelle ${name} fehlt: ${file}`);
    const identity = db
      .prepare("SELECT value FROM meta WHERE key='world-identity-v1'")
      .get();
    const storedDataset = db
      .prepare("SELECT value FROM meta WHERE key='geodata-dataset-v1'")
      .get()?.value;
    if (!identity || JSON.parse(identity.value).world !== "germany-1")
      throw Error(
        `Weltkonflikt oder fehlende Weltkennung: ${file}. Bestehende Daten bleiben unverändert.`,
      );
    if (
      !/^[a-f0-9]{64}$/.test(storedDataset) ||
      (dataset && dataset !== storedDataset)
    )
      throw Error(
        `Geodatenversion passt nicht zum Spielstand: ${file}. Bisheriges Datenpaket wieder zuordnen.`,
      );
    for (const table of ["saves", "solo_saves"].filter((name) =>
      tables.has(name),
    ))
      for (const row of db.prepare(`SELECT data FROM ${table}`).iterate())
        if (JSON.parse(row.data).world !== "germany-1")
          throw Error(`Weltkonflikt im gespeicherten Spielstand: ${file}`);
    return { status: "ready", schema: version, dataset: storedDataset };
  });
}
export function inspectInstallation(config, { allowMissingGeo = false } = {}) {
  const data = config.settings.DATA_DIR,
    geo = config.settings.GEODATA_DIR;
  const marker = resolve(data, ".leitstellen-instance.json");
  if (regularFile(marker)) {
    const binding = JSON.parse(readFileSync(marker, "utf8"));
    if (
      binding.programRoot !== config.programRoot ||
      (config.identity && binding.id !== config.identity.id)
    )
      throw Error(`Spielordner gehört einer anderen Installation: ${data}`);
  }
  const geodata = inspectGeodata(geo),
    game = inspectGame(data, geodata.dataset);
  if (!allowMissingGeo && geodata.status !== "ready")
    throw Error(
      "Fertiges Deutschland-Geodatenpaket fehlt. Setup: node scripts/install-germany.mjs",
    );
  if (game.status === "ready" && geodata.status !== "ready")
    throw Error(
      "Zum bestehenden Spielstand fehlt das validierbare Geodatenpaket. Pfad oder gesichertes Paket wiederherstellen.",
    );
  if (config.identity?.databaseSeen && game.status !== "ready")
    throw Error(
      "Die bekannte Spieldatenbank fehlt. Sicherung wiederherstellen; keine neue Ersatzwelt erzeugt.",
    );
  if (
    config.identity?.dataset &&
    geodata.dataset &&
    config.identity.dataset !== geodata.dataset
  )
    throw Error(
      "Geodatenpaket widerspricht geschützter Installationszuordnung.",
    );
  return { game, geodata };
}
