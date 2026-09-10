import { Database } from "../../server/database";
import { mkdirSync } from "node:fs";
import { fixtureDataset } from "./germany/locations";
export function installationDatabase(
  dir: string,
  world = "germany-1",
  dataset = fixtureDataset,
) {
  mkdirSync(dir, { recursive: true });
  const db = new Database(dir);
  db.sql
    .prepare("INSERT OR REPLACE INTO meta VALUES('world-identity-v1',?)")
    .run(JSON.stringify({ world }));
  db.sql
    .prepare("INSERT OR REPLACE INTO meta VALUES('geodata-dataset-v1',?)")
    .run(dataset);
  db.close();
}
