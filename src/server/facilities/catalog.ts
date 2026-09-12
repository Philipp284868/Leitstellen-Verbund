import { DatabaseSync } from "node:sqlite";
import type {
  Facility,
  FacilityCatalog,
  FacilityCluster,
  FacilityKind,
  FacilityQuery,
} from "../../shared/facilities/types";
import { project } from "../../shared/germany/projection";

/** Static read-only catalog; indexed geography is independent of every dispatch-center save. */
export class SqliteFacilityCatalog implements FacilityCatalog {
  readonly snapshot: string;
  private readonly db: DatabaseSync;
  constructor(path: string, dataset: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    try {
      if (this.db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok")
        throw Error(
          "Standortkatalog ist beschädigt; vorhandene Spielstände bleiben unverändert.",
        );
      const meta = Object.fromEntries(
        this.db
          .prepare("SELECT key,value FROM metadata")
          .all()
          .map((r) => [String(r.key), String(r.value)]),
      );
      if (meta.schema !== "1" || meta.dataset !== dataset || !meta.snapshot)
        throw Error("Standortkatalog passt nicht zum Deutschland-Datenpaket.");
      this.snapshot = meta.snapshot;
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private read(row: Record<string, unknown>): Facility {
    const data = JSON.parse(String(row.data));
    return {
      id: data.id,
      kind: data.kind,
      name: data.name,
      address: data.address,
      state: data.state,
      snapshot: data.snapshot,
      sources: data.sources,
      subtype: data.subtype,
      emergency: data.emergency,
      status: data.status,
      quality: data.quality,
      lon: data.lon,
      lat: data.lat,
      pos: project(data),
      accessAlternatives: (data.accessAlternatives ?? [])
        .slice(0, 2)
        .map(
          (access: {
            lon: number;
            lat: number;
            source: string;
            method: NonNullable<Facility["access"]>["method"];
          }) => ({
            pos: project(access),
            source: access.source,
            method: access.method,
          }),
        ),
      ...(data.access
        ? {
            access: {
              pos: project(data.access),
              source: data.access.source,
              method: data.access.method,
            },
          }
        : {}),
    };
  }
  get(id: string) {
    const row = this.db
      .prepare(
        "SELECT data FROM facilities WHERE id=? OR id=(SELECT facility_id FROM aliases WHERE source=?) LIMIT 1",
      )
      .get(id, id);
    return row ? this.read(row) : undefined;
  }
  query(query: FacilityQuery) {
    const where: string[] = [],
      args: (string | number)[] = [];
    let joins = "";
    if (query.bbox) {
      joins += " JOIN facilities_rtree r ON r.rowid=f.rowid";
      where.push(
        "r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=?",
      );
      const [w, s, e, n] = query.bbox;
      args.push(e, w, n, s);
    }
    if (query.search) {
      const terms = query.search.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8);
      if (!terms?.length) return [];
      joins += " JOIN facilities_fts ON facilities_fts.rowid=f.rowid";
      where.push("facilities_fts MATCH ?");
      args.push(terms.map((t) => '"' + t + '"*').join(" AND "));
    }
    if (query.kind) {
      where.push("f.kind=?");
      args.push(query.kind);
    }
    if (query.usable) where.push("f.usable=1");
    if (query.offerFilter) {
      const { kinds, owned, available } = query.offerFilter;
      const canBuy = kinds.length
        ? `(f.usable=1 AND f.kind IN (${kinds.map(() => "?").join(",")}))`
        : "0";
      where.push(available ? canBuy : `NOT ${canBuy}`);
      args.push(...kinds);
      if (owned.length) {
        where.push(`f.id NOT IN (${owned.map(() => "?").join(",")})`);
        args.push(...owned);
      }
    }
    if (query.ids) {
      if (!query.ids.length) return [];
      const ids = query.ids.slice(0, 150);
      where.push(`f.id IN (${ids.map(() => "?").join(",")})`);
      args.push(...ids);
    }
    const limit = Math.max(1, Math.min(200, query.limit || 80));
    return this.db
      .prepare(
        `SELECT f.data FROM facilities f${joins}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY f.usable DESC,f.name,f.id LIMIT ?`,
      )
      .all(...args, limit)
      .map((row) => this.read(row));
  }
  clusters(
    bbox: [number, number, number, number],
    zoom: number,
    kind?: FacilityKind,
  ): FacilityCluster[] {
    const [w, s, e, n] = bbox;
    // At high zoom each real facility remains individually selectable. At lower zoom a bounded SQL grid summarizes the entire viewport.
    const cell = 360 / 2 ** Math.min(18, Math.max(4, Math.floor(zoom))) / 8;
    return this.db
      .prepare(
        `SELECT AVG(f.lon) lon,AVG(f.lat) lat,COUNT(*) count,MIN(f.id) id,MIN(f.kind) kind,MIN(f.name) name,MIN(f.usable) usable FROM facilities f JOIN facilities_rtree r ON r.rowid=f.rowid WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? ${kind ? "AND f.kind=?" : ""} GROUP BY ${zoom >= 16 ? "f.id" : "CAST((f.lon+180)/? AS INTEGER),CAST((f.lat+90)/? AS INTEGER)"} LIMIT 2000`,
      )
      .all(
        e,
        w,
        n,
        s,
        ...(kind ? [kind] : []),
        ...(zoom >= 16 ? [] : [cell, cell]),
      )
      .map((row) => ({
        lon: Number(row.lon),
        lat: Number(row.lat),
        count: Number(row.count),
        ...(Number(row.count) === 1
          ? {
              id: String(row.id),
              kind: row.kind as FacilityKind,
              name: String(row.name),
              usable: !!row.usable,
            }
          : {}),
      }));
  }
  close() {
    this.db.close();
  }
}
