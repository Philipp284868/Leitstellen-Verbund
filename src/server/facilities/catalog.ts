import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  Facility,
  FacilityCatalog,
  FacilityCluster,
  FacilityKind,
  FacilityQuery,
} from "../../shared/facilities/types";
import { project } from "../../shared/germany/projection";
import {
  catalogFireProfile,
  preparedFireSources,
  sharedFireBuildings,
} from "./fire-profiles";
import { fireProfileSchema } from "../../shared/facilities/fire-profile";

/** Static read-only catalog; indexed geography is independent of every dispatch-center save. */
export class SqliteFacilityCatalog implements FacilityCatalog {
  readonly snapshot: string;
  private readonly db: DatabaseSync;
  private statements = new Map<string, StatementSync>();
  private clusterCache = new Map<string, FacilityCluster[]>();
  private sharedBuildings = new Map<
    string,
    { primary: string; sources: string[] }
  >();
  private secondaryIds: string[] = [];
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
      // Small versioned correction pack joined through the existing alias index. No full OSM import.
      this.db.exec(
        "CREATE TEMP TABLE fire_profiles(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL)",
      );
      const rows = this.db
        .prepare(
          "SELECT DISTINCT f.id,f.data FROM facilities f JOIN aliases a ON a.facility_id=f.id WHERE a.source IN (SELECT value FROM json_each(?)) AND f.kind='fire'",
        )
        .all(JSON.stringify(preparedFireSources));
      const insert = this.db.prepare(
        "INSERT INTO temp.fire_profiles VALUES(?,?,?)",
      );
      for (const row of rows) {
        const value = JSON.parse(String(row.data));
        const profile = catalogFireProfile(value.sources);
        insert.run(row.id, profile.kind, JSON.stringify(profile));
      }
      for (const sources of sharedFireBuildings) {
        const members = sources.flatMap((source) => {
          const member = this.db
            .prepare(
              "SELECT f.id,f.data FROM facilities f JOIN aliases a ON a.facility_id=f.id WHERE a.source=? AND f.kind='fire'",
            )
            .get(source);
          return member ? [member] : [];
        });
        if (!members.length) continue;
        const primary = String(members[0].id),
          ids = [...new Set(members.map((m) => String(m.id)))];
        const identity = {
          primary,
          sources: [
            ...new Set([
              ...members.flatMap(
                (m) => JSON.parse(String(m.data)).sources as string[],
              ),
              ...ids,
            ]),
          ],
        };
        for (const id of ids) this.sharedBuildings.set(id, identity);
        this.secondaryIds.push(...ids.filter((id) => id !== primary));
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private read(row: Record<string, unknown>): Facility {
    const data = JSON.parse(String(row.data));
    const corrected =
      data.kind === "fire" ? catalogFireProfile(data.sources) : undefined;
    return {
      ...(data.kind === "fire"
        ? {
            fireProfile:
              corrected?.confidence !== "unknown"
                ? corrected
                : data.fireProfile
                  ? fireProfileSchema.parse(data.fireProfile)
                  : corrected,
          }
        : {}),
      id: data.id,
      kind: data.kind,
      name: data.name,
      address: data.address,
      state: data.state,
      snapshot: data.snapshot,
      sources: this.sharedBuildings.get(data.id)?.sources ?? data.sources,
      subtype: data.subtype,
      emergency: data.emergency,
      status: data.status,
      quality: data.quality,
      lon: data.lon,
      lat: data.lat,
      pos: project(data),
      accessAlternatives: (data.accessAlternatives ?? [])
        .slice(0, 4)
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
    let row = this.db
      .prepare(
        "SELECT data FROM facilities WHERE id=? OR id=(SELECT facility_id FROM aliases WHERE source=?) LIMIT 1",
      )
      .get(id, id);
    if (row) {
      const primary = this.sharedBuildings.get(
        JSON.parse(String(row.data)).id,
      )?.primary;
      if (primary)
        row = this.db
          .prepare("SELECT data FROM facilities WHERE id=?")
          .get(primary);
    }
    return row ? this.read(row) : undefined;
  }
  query(query: FacilityQuery) {
    const where: string[] = [],
      args: (string | number)[] = [];
    let joins = " LEFT JOIN temp.fire_profiles fp ON fp.id=f.id";
    const fireKind =
      "COALESCE(fp.kind,json_extract(f.data,'$.fireProfile.kind'),'unknown')";
    if (this.secondaryIds.length) {
      where.push("f.id NOT IN (SELECT value FROM json_each(?))");
      args.push(JSON.stringify(this.secondaryIds));
    }
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
    if (query.fireKinds) {
      if (!query.fireKinds.length) return [];
      where.push(
        `f.kind='fire' AND ${fireKind} IN (${query.fireKinds.map(() => "?").join(",")})`,
      );
      args.push(...query.fireKinds);
    }
    if (query.offerFilter) {
      const { kinds, available, fireKinds } = query.offerFilter;
      const owned = [
        ...new Set(
          query.offerFilter.owned.map(
            (id) => this.sharedBuildings.get(id)?.primary ?? id,
          ),
        ),
      ];
      const canBuy = kinds.length
        ? `(f.usable=1 AND f.kind IN (${kinds.map(() => "?").join(",")})${fireKinds ? ` AND (f.kind!='fire' OR ${fireKinds.length ? `${fireKind} IN (${fireKinds.map(() => "?").join(",")})` : "0"})` : ""})`
        : "0";
      where.push(available ? canBuy : `NOT ${canBuy}`);
      args.push(...kinds);
      if (kinds.length && fireKinds) args.push(...fireKinds);
      if (owned.length) {
        where.push(`f.id NOT IN (${owned.map(() => "?").join(",")})`);
        args.push(...owned);
      }
    }
    if (query.ids) {
      if (!query.ids.length) return [];
      const ids = [
        ...new Set(
          query.ids
            .slice(0, 150)
            .map((id) => this.sharedBuildings.get(id)?.primary ?? id),
        ),
      ];
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
        `SELECT AVG(f.lon) lon,AVG(f.lat) lat,COUNT(*) count,MIN(f.id) id,MIN(f.kind) kind,MIN(f.name) name,MIN(f.usable) usable,MIN(COALESCE(fp.kind,json_extract(f.data,'$.fireProfile.kind'),'unknown')) fire_kind FROM facilities f LEFT JOIN temp.fire_profiles fp ON fp.id=f.id JOIN facilities_rtree r ON r.rowid=f.rowid WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? AND f.id NOT IN (SELECT value FROM json_each(?)) ${kind ? "AND f.kind=?" : ""} GROUP BY ${individual ? "f.id" : "CAST((f.lon+180)/? AS INTEGER),CAST((f.lat+90)/? AS INTEGER)"} LIMIT 2001`,
      ).all(
        e,
        w,
        n,
        s,
        JSON.stringify(this.secondaryIds),
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
            usable:
              !!row.usable &&
              (row.kind !== "fire" || row.fire_kind !== "unknown"),
            ...(row.kind === "fire"
              ? {
                  fireKind: row.fire_kind as NonNullable<
                    Facility["fireProfile"]
                  >["kind"],
                }
              : {}),
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
