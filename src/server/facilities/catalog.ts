import { DatabaseSync, type StatementSync } from "node:sqlite";
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
  private statements = new Map<string, StatementSync>();
  private clusterCache = new Map<string, FacilityCluster[]>();
  private statement(sql: string) {
    let prepared = this.statements.get(sql);
    if (!prepared) {
      prepared = this.db.prepare(sql);
      this.statements.set(sql, prepared);
      if (this.statements.size > 32)
        this.statements.delete(this.statements.keys().next().value!);
    }
    return prepared;
  }
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
    return this.statement(
      `SELECT f.data FROM facilities f${joins}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY f.usable DESC,f.name,f.id LIMIT ? OFFSET ?`,
    )
      .all(...args, limit, Math.max(0, Math.min(1000000, query.offset || 0)))
      .map((row) => this.read(row));
  }
  clusters(
    bbox: [number, number, number, number],
    zoom: number,
    kind?: FacilityKind,
  ): FacilityCluster[] {
    const [w, s, e, n] = bbox;
    const key = JSON.stringify([this.snapshot, bbox, Math.floor(zoom), kind]);
    const cached = this.clusterCache.get(key);
    if (cached) return cached;
    // Never discard the tail of dense viewports. Coarsen until every facility is represented.
    let cell = Math.max(
      360 / 2 ** Math.min(18, Math.max(4, Math.floor(zoom))) / 8,
      (e - w) / 40,
      (n - s) / 40,
    );
    let individual = zoom >= 16;
    let rows: Record<string, unknown>[];
    do {
      rows = this.statement(
        `SELECT AVG(f.lon) lon,AVG(f.lat) lat,COUNT(*) count,MIN(f.id) id,MIN(f.kind) kind,MIN(f.name) name,MIN(f.usable) usable FROM facilities f JOIN facilities_rtree r ON r.rowid=f.rowid WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? ${kind ? "AND f.kind=?" : ""} GROUP BY ${individual ? "f.id" : "CAST((f.lon+180)/? AS INTEGER),CAST((f.lat+90)/? AS INTEGER)"} LIMIT 2001`,
      ).all(
        e,
        w,
        n,
        s,
        ...(kind ? [kind] : []),
        ...(individual ? [] : [cell, cell]),
      );
      if (rows.length <= 2000) break;
      individual = false;
      cell *= 2;
    } while (true);
    const result = rows.map((row) => ({
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
    this.clusterCache.set(key, result);
    if (this.clusterCache.size > 32)
      this.clusterCache.delete(this.clusterCache.keys().next().value!);
    return result;
  }

  close() {
    this.db.close();
  }
}
