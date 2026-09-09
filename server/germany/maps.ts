import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { BOUNDS, project } from "../../src/germany/projection";
import { indexedPoiTile, poiTileBounds, createPoiIndex } from "./poi-index";

const manifestSchema = z
  .object({
    schema: z.literal(1),
    worldId: z.literal("germany-1"),
    status: z.literal("ready"),
    snapshot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dataset: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .passthrough();
const demSchema = z.object({
  status: z.literal("ready"),
  source: z.string().min(1),
  attribution: z.string().min(1).max(2000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  sourceId: z.string().min(1),
  sourceLockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  minzoom: z.literal(5),
  maxzoom: z.literal(11),
  tileSize: z.literal(256),
  encoding: z.literal("terrarium"),
});
/** Read-only shared geography. No game state or account information enters this store. */
export class GermanyMaps {
  readonly manifest: z.infer<typeof manifestSchema>;
  readonly index: DatabaseSync;
  readonly tiles: DatabaseSync;
  private readonly poiIndex?: DatabaseSync;
  readonly dem?: { manifest: z.infer<typeof demSchema>; db: DatabaseSync };
  private readonly cache = new Map<string, Buffer>();
  private cacheBytes = 0;
  private readonly poiCache = new Map<
    string,
    ReturnType<typeof indexedPoiTile>
  >();
  private readonly searches = new Map<
    string,
    {
      id: string;
      name: string;
      kind: string;
      lon: number;
      lat: number;
      region: string;
    }[]
  >();
  constructor(public readonly dir: string) {
    const root = realpathSync(dir);
    const child = (name: string) => {
      const path = realpathSync(resolve(root, name)),
        rel = relative(root, path);
      if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        throw Error(
          "Geodatenpaket enthält einen Pfad außerhalb seines Verzeichnisses.",
        );
      return path;
    };
    this.manifest = manifestSchema.parse(
      JSON.parse(readFileSync(child("manifest.json"), "utf8")),
    );
    this.index = new DatabaseSync(child("index.sqlite"), { readOnly: true });
    try {
      this.tiles = new DatabaseSync(child("maps.mbtiles"), { readOnly: true });
    } catch (error) {
      this.index.close();
      throw error;
    }
    try {
      const indexSource = this.index
        .prepare("SELECT value FROM metadata WHERE key='source_sha256'")
        .get()?.value;
      const tileSource = this.tiles
        .prepare("SELECT value FROM metadata WHERE name='source_sha256'")
        .get()?.value;
      if (
        indexSource !== this.manifest.dataset ||
        tileSource !== this.manifest.dataset
      )
        throw Error(
          "Kartenkacheln, Ortsindex und Manifest stammen nicht aus demselben Datenbestand.",
        );
      this.poiIndex = createPoiIndex(this.index);
      if (existsSync(resolve(root, "dem-manifest.json"))) {
        const manifest = demSchema.parse(
          JSON.parse(readFileSync(child("dem-manifest.json"), "utf8")),
        );
        const file = child("dem.mbtiles");
        if (statSync(file).size !== manifest.bytes)
          throw Error("Höhenmodell und Manifest stimmen nicht überein.");
        const db = new DatabaseSync(file, { readOnly: true });
        try {
          const metadata = (key: string) =>
            db.prepare("SELECT value FROM metadata WHERE name=?").get(key)
              ?.value;
          if (
            metadata("source_id") !== manifest.sourceId ||
            metadata("source_lock_sha256") !== manifest.sourceLockSha256 ||
            metadata("encoding") !== manifest.encoding ||
            Number(metadata("minzoom")) !== manifest.minzoom ||
            Number(metadata("maxzoom")) !== manifest.maxzoom
          )
            throw Error(
              "Höhenmodell gehört nicht zum freigegebenen Quellenstand.",
            );
          this.dem = { manifest, db };
        } catch (error) {
          db.close();
          throw error;
        }
      }
    } catch (error) {
      this.poiIndex?.close();
      this.tiles.close();
      this.index.close();
      throw error;
    }
  }
  close() {
    this.poiIndex?.close();
    this.index.close();
    this.tiles.close();
    this.dem?.db.close();
    this.cache.clear();
    this.searches.clear();
    this.poiCache.clear();
  }
  publicManifest() {
    return {
      world: "germany-1",
      dataset: this.manifest.dataset,
      snapshot: this.manifest.snapshot,
      bounds: BOUNDS,
      minzoom: 0,
      maxzoom: 14,
      attribution: [
        {
          name: "OpenStreetMap contributors",
          url: "https://www.openstreetmap.org/copyright",
        },
        { name: "OpenMapTiles", url: "https://openmaptiles.org/" },
      ],
      projection: "Scaled spherical Mercator; route distances geodesic",
      tiles: "/geo/tiles/{z}/{x}/{y}.pbf",
      ...(this.dem
        ? {
            dem: {
              dataset: this.dem.manifest.sha256,
              minzoom: this.dem.manifest.minzoom,
              maxzoom: this.dem.manifest.maxzoom,
              encoding: this.dem.manifest.encoding,
              attribution: this.dem.manifest.attribution,
            },
          }
        : {}),
    };
  }
  search(query: string) {
    const normalized = query.normalize("NFC").trim().slice(0, 120);
    const cached = this.searches.get(normalized);
    if (cached) return cached;
    const terms = normalized.split(/\s+/).filter(Boolean).slice(0, 8);
    if (!terms.length || normalized.length < 2) return [];
    const match = terms
      .map((s) => `"${s.replaceAll('"', '""')}"*`)
      .join(" AND ");
    const exact = this.index
      .prepare(
        `SELECT id,name,kind,display_name,lon,lat,region FROM places
      WHERE name=? COLLATE NOCASE AND kind IN ('city','town','village','hamlet','suburb','neighbourhood','state')
      ORDER BY CASE kind WHEN 'city' THEN 0 WHEN 'state' THEN 1 WHEN 'town' THEN 2 WHEN 'village' THEN 3 ELSE 4 END,id LIMIT 8`,
      )
      .all(normalized);
    const matches = this.index
      .prepare(
        // Materialize a bounded posting-list prefix BEFORE sorting or joining.
        // A nationwide bm25 sort on common names can otherwise block the game
        // thread for seconds despite LIMIT 20 on the final result.
        `WITH candidates AS MATERIALIZED (
        SELECT rowid FROM places_fts WHERE places_fts MATCH ? LIMIT 256
      ) SELECT p.id,p.name,p.kind,p.display_name,p.lon,p.lat,p.region
      FROM candidates JOIN places p ON p.id=candidates.rowid`,
      )
      .all(match);
    const fold = (value: unknown) =>
      String(value)
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase("de");
    const needle = fold(normalized);
    matches.sort((a, b) => {
      const score = (r: typeof a) =>
        (fold(r.name) === needle ? 0 : 1000) +
        String(r.display_name || r.name).length;
      return score(a) - score(b) || Number(a.id) - Number(b.id);
    });
    const result = [
      ...new Map([...exact, ...matches].map((r) => [String(r.id), r])).values(),
    ]
      .slice(0, 20)
      .map((r) => ({
        id: String(r.id),
        name: String(r.display_name || r.name),
        kind: String(r.kind),
        lon: Number(r.lon),
        lat: Number(r.lat),
        region: String(r.region || ""),
      }));
    if (this.searches.size >= 128)
      this.searches.delete(this.searches.keys().next().value!);
    this.searches.set(normalized, result);
    return result;
  }
  node(id: number) {
    if (!Number.isSafeInteger(id) || id < 0)
      throw Error("Ungültige Standortkennung.");
    const row = this.index
      .prepare("SELECT id,lon,lat,name FROM anchors WHERE id=?")
      .get(id);
    return row
      ? {
          id: Number(row.id),
          lon: Number(row.lon),
          lat: Number(row.lat),
          ...project({ lon: Number(row.lon), lat: Number(row.lat) }),
          name: String(row.name || "Straßenstandort"),
        }
      : null;
  }
  tile(z: number, x: number, y: number, elevation = false) {
    if (
      ![z, x, y].every(Number.isInteger) ||
      z < 0 ||
      z > (elevation ? 11 : 14) ||
      (elevation && z < 5) ||
      x < 0 ||
      y < 0 ||
      x >= 2 ** z ||
      y >= 2 ** z
    )
      throw Error("Ungültige Kartenkachel.");
    const key = `${elevation ? "dem" : "map"}/${z}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const source = elevation ? this.dem?.db : this.tiles;
    if (!source) return null;
    const limit = (elevation ? 4 : 16) * 1024 * 1024;
    const row = source
      .prepare(
        // SQLite can read a BLOB's length without materializing its contents.
        // Apply the limit before returning a potentially corrupt giant payload.
        "SELECT length(tile_data) AS bytes, CASE WHEN length(tile_data)<=? THEN tile_data ELSE NULL END AS tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
      )
      .get(limit, z, x, 2 ** z - 1 - y);
    if (!row) return null;
    if (Number(row.bytes) > limit)
      throw Error("Kartenkachel überschreitet die Größenbegrenzung.");
    const bytes = Buffer.from(row.tile_data as Uint8Array);
    while (
      this.cache.size &&
      (this.cacheBytes + bytes.length > 32 * 1024 * 1024 ||
        this.cache.size >= 192)
    ) {
      const oldest = this.cache.keys().next().value!;
      this.cacheBytes -= this.cache.get(oldest)!.length;
      this.cache.delete(oldest);
    }
    this.cache.set(key, bytes);
    this.cacheBytes += bytes.length;
    return bytes;
  }
  handle(path: string, url: URL, res: ServerResponse) {
    const json = (data: unknown) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
    };
    if (path === "/geo/manifest") {
      json(this.publicManifest());
      return true;
    }
    if (path === "/geo/search") {
      json(this.search(url.searchParams.get("q") || ""));
      return true;
    }
    if (path === "/geo/node") {
      json(this.node(Number(url.searchParams.get("id"))));
      return true;
    }
    const poi = /^\/geo\/pois\/(\d{1,2})\/(\d{1,5})\/(\d{1,5})\.json$/.exec(
      path,
    );
    if (poi) {
      try {
        poiTileBounds(Number(poi[1]), Number(poi[2]), Number(poi[3]));
      } catch {
        res.statusCode = 400;
        json({ error: "Ungültige POI-Kachel." });
        return true;
      }
      if (
        url.searchParams.has("dataset") &&
        url.searchParams.get("dataset") !== this.manifest.dataset
      ) {
        res.statusCode = 409;
        json({ error: "Kartenstand hat sich geändert. Ansicht neu laden." });
        return true;
      }
      const key = poi.slice(1).join("/");
      let points = this.poiCache.get(key);
      if (!points) {
        points = indexedPoiTile(
          this.poiIndex!,
          Number(poi[1]),
          Number(poi[2]),
          Number(poi[3]),
        );
        if (this.poiCache.size >= 96)
          this.poiCache.delete(this.poiCache.keys().next().value!);
        this.poiCache.set(key, points);
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
      json({
        dataset: this.manifest.dataset,
        snapshot: this.manifest.snapshot,
        points,
      });
      return true;
    }
    const tile =
      /^\/geo\/(tiles|dem)\/(\d{1,2})\/(\d{1,5})\/(\d{1,5})\.(pbf|png)$/.exec(
        path,
      );
    if (tile) {
      const elevation = tile[1] === "dem";
      if (tile[5] !== (elevation ? "png" : "pbf")) return false;
      const dataset = elevation
        ? this.dem?.manifest.sha256
        : this.manifest.dataset;
      if (!dataset) {
        res.statusCode = 404;
        json({ error: "Kein Höhenmodell installiert." });
        return true;
      }
      if (
        url.searchParams.has("dataset") &&
        url.searchParams.get("dataset") !== dataset
      ) {
        res.statusCode = 409;
        json({ error: "Kartenstand hat sich geändert. Ansicht neu laden." });
        return true;
      }
      const bytes = this.tile(
        Number(tile[2]),
        Number(tile[3]),
        Number(tile[4]),
        elevation,
      );
      if (!bytes) {
        res.statusCode = 204;
        res.end();
        return true;
      }
      res.setHeader(
        "Content-Type",
        elevation ? "image/png" : "application/vnd.mapbox-vector-tile",
      );
      if (bytes[0] === 0x1f && bytes[1] === 0x8b)
        res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("ETag", `"${dataset}-${tile[2]}-${tile[3]}-${tile[4]}"`);
      res.end(bytes);
      return true;
    }
    return false;
  }
}
