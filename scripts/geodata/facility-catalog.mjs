import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  classifyFacility,
  covers,
  sameFacility,
} from "./facility-classification.mjs";

export const CATALOG_SCHEMA = `CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE facilities(rowid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, state TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL, usable INTEGER NOT NULL, data TEXT NOT NULL);
CREATE VIRTUAL TABLE facilities_rtree USING rtree(rowid,min_lon,max_lon,min_lat,max_lat);
CREATE VIRTUAL TABLE facilities_fts USING fts5(name,address,state,content='facilities',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TABLE aliases(source TEXT PRIMARY KEY,facility_id TEXT NOT NULL REFERENCES facilities(id));
CREATE INDEX facilities_kind ON facilities(kind,usable);`;
function distance(a, b) {
  const rad = Math.PI / 180,
    x = (a.lon - b.lon) * rad * Math.cos(((a.lat + b.lat) * rad) / 2),
    y = (a.lat - b.lat) * rad;
  return 6371008.8 * Math.hypot(x, y);
}
function accessFor(site, index) {
  if (site.kind === "heli")
    return {
      lon: site.lon,
      lat: site.lat,
      source: site.source,
      method: "air-base",
    };
  if (!index) return;
  const points = [site, ...(site.entrances || [])];
  const candidates = new Map();
  for (const p of points)
    for (const row of index
      .prepare(
        `SELECT a.* FROM anchors_rtree r JOIN anchors a ON a.id=r.id WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? AND a.bridge=0 AND a.tunnel=0 AND a.road_class NOT IN ('motorway','motorway_link','trunk','trunk_link','track') LIMIT 256`,
      )
      .all(p.lon + 0.002, p.lon - 0.002, p.lat + 0.001, p.lat - 0.001))
      candidates.set(row.id, row);
  const entrances = (site.entrances || []).filter(
    (e) =>
      e.tags.entrance !== "exit" &&
      e.tags.access !== "no" &&
      (e.tags.emergency === "emergency_ward_entrance" ||
        ["garage", "service", "main", "yes"].includes(e.tags.entrance)),
  );
  const ranked = [];
  for (const a of candidates.values()) {
    const entry = entrances
      .filter((e) => distance(a, e) <= 12)
      .sort(
        (x, y) =>
          Number(y.tags.emergency === "emergency_ward_entrance") -
            Number(x.tags.emergency === "emergency_ward_entrance") ||
          distance(a, x) - distance(a, y),
      )[0];
    const onsite =
      (!site.tags.building || site.tags.building === "no") &&
      covers(site.geometry, a);
    const exactPoint = site.geometry.type === "Point" && distance(site, a) <= 8;
    if (entry || onsite || exactPoint)
      ranked.push({
        lon: a.lon,
        lat: a.lat,
        source: entry
          ? `${entry.source};road-node:${a.id}`
          : `road-node:${a.id}`,
        method: entry ? "entrance" : "onsite-road",
        rank: (entry ? 0 : 1000) + distance(site, a),
      });
  }
  const best = ranked.sort(
    (a, b) => a.rank - b.rank || a.source.localeCompare(b.source),
  )[0];
  if (best) {
    return {
      lon: best.lon,
      lat: best.lat,
      source: best.source,
      method: best.method,
    };
  }
}
export function normalizeFacilities(
  records,
  { snapshot, previous = [], supplemental = [], reviews = [] } = {},
) {
  const classified = records
    .flatMap((record) => {
      const classification = classifyFacility(record.tags);
      return classification ? [{ ...record, ...classification }] : [];
    })
    .sort(
      (a, b) =>
        (({ relation: 0, way: 1, node: 2 })[a.source.split(":")[0]] ?? 3) -
          ({ relation: 0, way: 1, node: 2 }[b.source.split(":")[0]] ?? 3) ||
        a.source.localeCompare(b.source),
    );
  const result = [],
    cells = new Map();
  for (const row of classified) {
    const x = Math.floor(row.lon * 100),
      y = Math.floor(row.lat * 100),
      near = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        near.push(...(cells.get(`${x + dx}:${y + dy}`) || []));
    const found = near.filter((old) => sameFacility(old, row));
    if (found.length > 1) {
      for (const old of found) {
        old.status = "review";
        old.quality.push(`Mehrdeutige Dublette: ${row.source}`);
      }
      row.status = "review";
    }
    if (found.length === 1) {
      const old = found[0];
      old.sources.push(row.source);
      old.entrances.push(...row.entrances);
      if (old.status !== row.status || old.emergency !== row.emergency) {
        old.status = "review";
        old.quality.push(
          "Widersprüchliche Betriebs-/Notaufnahmeangaben in Quellrepräsentationen",
        );
      }
      continue;
    }
    const quality = [];
    if (found.length > 1)
      quality.push("Mehrdeutige Dublette: administrative Prüfung nötig");
    if (!row.tags.name) quality.push("Name nicht erfasst");
    if (row.subtype === "unknown") quality.push("Untertyp nicht belegt");
    if (row.kind === "hospital" && row.emergency === "unknown")
      quality.push("Notaufnahme nicht belegt; Spielprofil separat");
    if (
      row.kind === "hospital" &&
      near.some((old) => old.kind === "hospital" && covers(old.geometry, row))
    ) {
      row.status = "review";
      quality.push("Mögliche Campus-Dublette: administrative Prüfung nötig");
    }
    const item = {
      ...row,
      id: `osm:${row.source}`,
      snapshot,
      sources: [row.source],
      quality,
      entrances: row.entrances || [],
    };
    result.push(item);
    const key = `${x}:${y}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
  }
  const previousSources = new Map();
  for (const old of previous)
    for (const source of old.sources) previousSources.set(source, old.id);
  const used = new Set();
  for (const row of result) {
    const prior = [
      ...new Set(
        row.sources.map((s) => previousSources.get(s)).filter(Boolean),
      ),
    ];
    if (prior.length > 1)
      throw Error(`Identity merge requires review: ${prior.join(", ")}`);
    if (prior.length) row.id = prior[0];
    if (used.has(row.id))
      throw Error(`Identity split requires review: ${row.id}`);
    used.add(row.id);
  }
  // Supplemental records are maintained offline, with explicit compatible licensing and source evidence.
  for (const row of supplemental) {
    if (
      !/^supplement:[a-z0-9-]{3,70}$/.test(row.id) ||
      !["ODbL-1.0", "CC0-1.0"].includes(row.license) ||
      !row.evidence?.length ||
      !row.reviewedAt ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.reviewedAt) ||
      !Number.isFinite(row.lon) ||
      row.lon < 5 ||
      row.lon > 16 ||
      !Number.isFinite(row.lat) ||
      row.lat < 47 ||
      row.lat > 56 ||
      !/^DE-(BW|BY|BE|BB|HB|HH|HE|MV|NI|NW|RP|SL|SN|ST|SH|TH)$/.test(
        row.state,
      ) ||
      !row.geometry ||
      !row.tags
    )
      throw Error(
        "Supplement requires stable ID, compatible license, dated review and evidence",
      );
    if (!row.evidence.every((url) => /^https:\/\//.test(url)))
      throw Error("Supplement evidence must be a public HTTPS source");
    if (used.has(row.id)) throw Error("Duplicate supplemental ID");
    const classification = classifyFacility(row.tags);
    if (!classification)
      throw Error("Supplement facility type lacks explicit evidence");
    if (row.geometry.type !== "Point" && !covers(row.geometry, row))
      throw Error(
        "Supplement display position must be inside its documented geometry",
      );
    if (
      row.geometry.type === "Point" &&
      (row.geometry.coordinates[0] !== row.lon ||
        row.geometry.coordinates[1] !== row.lat)
    )
      throw Error("Supplement point geometry and position disagree");
    result.push({
      ...row,
      ...classification,
      snapshot,
      sources: row.evidence,
      source: row.id,
      quality: ["Administrativ geprüfte Ergänzung"],
      entrances: row.entrances || [],
    });
    used.add(row.id);
  }
  for (const old of previous)
    if (!used.has(old.id))
      result.push({
        ...old,
        status: "review",
        quality: [
          ...old.quality,
          "Im neuen Quellstand nicht enthalten; Bestand bleibt erhalten",
        ],
        snapshot,
      });
  for (const review of reviews) {
    if (
      !review.source ||
      !review.reason ||
      !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)
    )
      throw Error("Invalid documented catalog review");
    for (const row of result.filter((r) => r.sources.includes(review.source))) {
      row.status = "review";
      row.quality.push(review.reason);
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
export function writeFacilityCatalog(
  output,
  rows,
  { dataset, snapshot, index, previousPath } = {},
) {
  if (existsSync(output) || existsSync(output + ".partial"))
    throw Error(`Catalog output already exists: ${output}`);
  const db = new DatabaseSync(output + ".partial");
  const previous = previousPath
    ? new DatabaseSync(previousPath, { readOnly: true })
    : undefined;
  const counts = {
    total: 0,
    usable: 0,
    byKind: {},
    byState: {},
    byStateKind: {},
    unknownSubtype: 0,
    unresolvedAccess: 0,
  };
  try {
    db.exec(CATALOG_SCHEMA);
    db.exec("BEGIN");
    for (const row of rows) {
      const access = accessFor(row, index);
      const address =
        [
          row.tags?.["addr:street"],
          row.tags?.["addr:housenumber"],
          row.tags?.["addr:postcode"],
          row.tags?.["addr:city"],
        ]
          .filter(Boolean)
          .join(" ") ||
        row.address ||
        "";
      const entry = {
        ...row,
        name: row.tags?.["name:de"] || row.tags?.name || row.name || "",
        address,
        access: access || row.access,
        quality: [...row.quality],
      };
      if (!entry.access) entry.quality.push("Zufahrt nicht hinreichend belegt");
      if (entry.kind === "water")
        entry.quality.push("Uferzugang wird vor Kauf separat geprüft");
      const usable = entry.status === "active" && !!entry.access;
      const inserted = db
        .prepare(
          "INSERT INTO facilities(id,kind,name,address,state,lon,lat,usable,data) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          entry.id,
          entry.kind,
          entry.name,
          entry.address,
          entry.state,
          entry.lon,
          entry.lat,
          Number(usable),
          JSON.stringify(entry),
        );
      db.prepare("INSERT INTO facilities_rtree VALUES(?,?,?,?,?)").run(
        inserted.lastInsertRowid,
        entry.lon,
        entry.lon,
        entry.lat,
        entry.lat,
      );
      const aliases = new Set(entry.sources);
      if (previous)
        for (const r of previous
          .prepare("SELECT source FROM aliases WHERE facility_id=?")
          .all(entry.id))
          aliases.add(r.source);
      for (const source of aliases)
        db.prepare("INSERT INTO aliases VALUES(?,?)").run(source, entry.id);
      counts.total++;
      if (usable) counts.usable++;
      if (!entry.access) counts.unresolvedAccess++;
      if (entry.subtype === "unknown") counts.unknownSubtype++;
      counts.byKind[entry.kind] = (counts.byKind[entry.kind] || 0) + 1;
      counts.byState[entry.state] = (counts.byState[entry.state] || 0) + 1;
      counts.byStateKind[entry.state] ??= {};
      counts.byStateKind[entry.state][entry.kind] =
        (counts.byStateKind[entry.state][entry.kind] || 0) + 1;
    }
    for (const [key, value] of Object.entries({
      schema: "1",
      dataset,
      snapshot,
      license: "ODbL-1.0",
      attribution: "© OpenStreetMap contributors",
      counts: JSON.stringify(counts),
    }))
      db.prepare("INSERT INTO metadata VALUES(?,?)").run(key, value);
    db.exec(
      "INSERT INTO facilities_fts(facilities_fts) VALUES('rebuild'); COMMIT; ANALYZE;",
    );
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("Facility catalog integrity check failed");
  } finally {
    db.close();
    previous?.close();
  }
  renameSync(output + ".partial", output);
  const bytes = readFileSync(output),
    report = {
      schema: 1,
      dataset,
      snapshot,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      ...counts,
    };
  writeFileSync(output + ".json", JSON.stringify(report, null, 2) + "\n");
  return report;
}
