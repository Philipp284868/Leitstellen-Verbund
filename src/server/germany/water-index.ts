import { createReadStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  inBounds,
  meters,
  project,
  unproject,
  type Point,
} from "../../shared/germany/projection";
const rowSchema = z
  .object({
    id: z.string().regex(/^node:\d+$/),
    lon: z.number().min(-180).max(180),
    lat: z.number().min(-85).max(85),
    properties: z.record(z.string().max(100), z.string().max(250)),
  })
  .strict();
/** Small pre-extracted OSM supplement: indexed once per immutable input hash, no Germany reimport on startup. */
export async function prepareWaterIndex(
  archive: string,
  cacheDir: string,
  dataset: string,
  expectedHash?: string,
) {
  if (!existsSync(archive))
    throw Error(
      "Wasserquellenpaket fehlt. Das vollständige freigegebene Update erneut installieren.",
    );
  const bytes = await readFile(archive);
  if (bytes.length > 32 * 1024 * 1024)
    throw Error("Wasserquellenpaket überschreitet das erlaubte Zusatzpaket.");
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHash && hash !== expectedHash)
    throw Error(
      "Wasserquellenpaket stimmt nicht mit dem freigegebenen Fingerabdruck überein.",
    );
  // Keep the journal path usable on Windows, including a long AMP installation path.
  // The complete digest remains inside the index and is checked before cache reuse.
  const target = resolve(cacheDir, `water-v1-${hash.slice(0, 24)}.sqlite`);
  if (existsSync(target)) {
    const cached = new DatabaseSync(target, { readOnly: true });
    try {
      if (
        cached.prepare("SELECT value FROM metadata WHERE key='hash'").get()
          ?.value !== hash ||
        cached.prepare("SELECT value FROM metadata WHERE key='dataset'").get()
          ?.value !== dataset
      )
        throw Error(
          "Wasserquellenindex hat einen widersprüchlichen Datenstand.",
        );
    } finally {
      cached.close();
    }
    return target;
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = resolve(
    cacheDir,
    `.water-${crypto.randomUUID().slice(0, 16)}.partial`,
  );
  const sql = new DatabaseSync(temporary);
  try {
    sql.exec(
      "PRAGMA journal_mode=DELETE;BEGIN;CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE sources(rowid INTEGER PRIMARY KEY,id TEXT UNIQUE,lon REAL,lat REAL,data TEXT);CREATE VIRTUAL TABLE sources_rtree USING rtree(rowid,min_lon,max_lon,min_lat,max_lat);",
    );
    const insert = sql.prepare(
      "INSERT INTO sources(id,lon,lat,data) VALUES(?,?,?,?)",
    );
    const spatial = sql.prepare("INSERT INTO sources_rtree VALUES(?,?,?,?,?)");
    const input = createReadStream(archive).pipe(createGunzip());
    const lines = createInterface({ input, crlfDelay: Infinity });
    let count = 0,
      total = 0,
      header = false;
    try {
      for await (const line of lines) {
        total += line.length;
        if (total > 512 * 1024 * 1024 || line.length > 8192)
          throw Error("Wasserquellenpaket ist zu groß.");
        if (!header) {
          const meta = JSON.parse(line);
          if (
            meta.schema !== 1 ||
            meta.sourceSha256 !== dataset ||
            !/^\d{4}-\d{2}-\d{2}$/.test(meta.snapshot)
          )
            throw Error(
              "Wasserquellen und Karte besitzen unterschiedliche OSM-Datenstände.",
            );
          sql
            .prepare(
              "INSERT INTO metadata VALUES('dataset',?),('snapshot',?),('hash',?)",
            )
            .run(dataset, meta.snapshot, hash);
          header = true;
          continue;
        }
        const row = rowSchema.parse(JSON.parse(line));
        if (
          !["fire_hydrant", "suction_point"].includes(row.properties.emergency)
        )
          throw Error("Keine freigegebene Löschwasserentnahmestelle.");
        if (!inBounds(project(row))) continue;
        if (++count > 1000000)
          throw Error("Zu viele Wasserquellen im Zusatzpaket.");
        const result = insert.run(
          row.id,
          row.lon,
          row.lat,
          JSON.stringify(row.properties),
        );
        spatial.run(result.lastInsertRowid, row.lon, row.lon, row.lat, row.lat);
      }
    } finally {
      lines.close();
      input.destroy();
    }
    if (!header) throw Error("Wasserquellenpaket ist leer.");
    sql.exec("COMMIT");
  } catch (error) {
    if (sql.isTransaction) sql.exec("ROLLBACK");
    throw error;
  } finally {
    sql.close();
  }
  renameSync(temporary, target);
  return target;
}
export class WaterIndex {
  private sql: DatabaseSync;
  readonly snapshot: string;
  constructor(
    path: string,
    readonly dataset: string,
  ) {
    this.sql = new DatabaseSync(path, { readOnly: true });
    const metadata = Object.fromEntries(
      this.sql
        .prepare("SELECT key,value FROM metadata")
        .all()
        .map((r) => [String(r.key), String(r.value)]),
    );
    if (metadata.dataset !== dataset) {
      this.sql.close();
      throw Error("Wasserquellenindex passt nicht zum OSM-Datenstand.");
    }
    this.snapshot = metadata.snapshot;
  }
  query(point: Point, radiusMeters: number, limit = 256) {
    const p = unproject(point),
      dy = radiusMeters / 110000,
      dx = dy / Math.cos((p.lat * Math.PI) / 180);
    return this.sql
      .prepare(
        "SELECT s.* FROM sources_rtree r JOIN sources s ON s.rowid=r.rowid WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? ORDER BY s.id LIMIT ?",
      )
      .all(
        p.lon + dx,
        p.lon - dx,
        p.lat + dy,
        p.lat - dy,
        Math.min(50000, limit),
      )
      .map((r) => ({
        id: String(r.id),
        pos: project({ lon: Number(r.lon), lat: Number(r.lat) }),
        properties: JSON.parse(String(r.data)) as Record<string, string>,
      }))
      .filter((r) => meters(point, r.pos) <= radiusMeters);
  }
  close() {
    this.sql.close();
  }
}
