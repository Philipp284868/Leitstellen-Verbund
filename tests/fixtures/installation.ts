import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fixtureDataset } from "./germany/locations";
export function installationDatabase(
  dir: string,
  world = "germany-1",
  dataset = fixtureDataset,
) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(resolve(dir, "game.sqlite"));
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE sessions(id TEXT); CREATE TABLE saves(data TEXT); CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); PRAGMA user_version=18",
  );
  db.prepare("INSERT INTO meta VALUES('world-identity-v1',?)").run(
    JSON.stringify({ world }),
  );
  db.prepare("INSERT INTO meta VALUES('geodata-dataset-v1',?)").run(dataset);
  db.close();
}
