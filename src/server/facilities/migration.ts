import type { DatabaseSync } from "node:sqlite";
import type { Facility, FacilityCatalog } from "../../shared/facilities/types";
import { meters, unproject } from "../../shared/germany/projection";
import { validate, type Building } from "../../shared/model";
import { assertFacilityAccess } from "../../shared/facilities/purchase";

export type FacilityResolution = {
  owner: string;
  building: string;
  facility: string;
  evidence: string;
};
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}\p{N}]/gu, "");
function storedWorlds(sql: DatabaseSync) {
  const worlds = sql
    .prepare("SELECT user_id,data FROM saves")
    .all()
    .map((r) => ({
      owner: String(r.user_id),
      key: String(r.user_id),
      raw: JSON.parse(String(r.data)),
      training: undefined as Record<string, unknown> | undefined,
    }));
  return worlds;
}
export function facilityBinding(f: Facility) {
  return {
    id: f.id,
    snapshot: f.snapshot,
    sources: f.sources,
    position: f.pos,
    emergency: f.emergency,
    subtype: f.subtype,
  };
}
export function planFacilityMigration(
  sql: DatabaseSync,
  catalog: FacilityCatalog,
  resolutions: FacilityResolution[] = [],
) {
  const changes: {
      owner: string;
      building: string;
      facility: string;
      reason: string;
      name: string;
      position: ReturnType<typeof unproject>;
      targetName: string;
      targetPosition: ReturnType<typeof unproject>;
    }[] = [],
    conflicts: {
      owner: string;
      building: string;
      name: string;
      reason: string;
      candidates: string[];
      type?: Building["type"];
      position?: ReturnType<typeof unproject>;
      candidateDetails?: {
        id: string;
        name: string;
        distanceMeters: number;
        position: ReturnType<typeof unproject>;
        status: Facility["status"];
        hasAccess: boolean;
        sources: Facility["sources"];
      }[];
    }[] = [];
  const saves = storedWorlds(sql);
  const matched = new Map<string, string>();
  for (const { owner, raw } of saves)
    for (const b of raw.buildings as Building[])
      if (b.facility) matched.set(`${owner}:${b.facility.id}`, b.id);
  for (const { owner, raw } of saves)
    for (const b of raw.buildings as Building[]) {
      if (b.facility) continue;
      const p = unproject(b.pos),
        candidates = catalog
          .query({
            bbox: [p.lon - 0.002, p.lat - 0.001, p.lon + 0.002, p.lat + 0.001],
            limit: 200,
          })
          .filter((f) => f.kind === b.type && meters(f.pos, b.pos) <= 100);
      const resolution = resolutions.filter(
        (r) => r.owner === owner && r.building === b.id,
      );
      let f: Facility | undefined,
        reason =
          "Keine eindeutige reale Einrichtung mit übereinstimmendem Typ, Namen und Standort.";
      if (
        resolution.length === 1 &&
        resolution[0].evidence.trim().length >= 20
      ) {
        f = catalog.get(resolution[0].facility);
        reason = "Explizite administrative Zuordnung mit Beleg";
      } else if (!resolution.length) {
        const exact = candidates.filter(
          (f) =>
            f.name &&
            normalize(f.name) === normalize(b.name) &&
            meters(f.pos, b.pos) <= 60,
        );
        if (exact.length === 1) {
          f = exact[0];
          reason = "Übereinstimmender Typ und Name innerhalb von 60 m";
        }
      }
      if (f?.kind !== b.type || !f?.access || f.status !== "active")
        f = undefined;
      if (f)
        try {
          assertFacilityAccess(f);
        } catch (error) {
          reason = `Zufahrt kann nicht übernommen werden: ${String(error)}`;
          f = undefined;
        }
      if (f) {
        const key = `${owner}:${f.id}`;
        if (matched.has(key)) {
          reason = `Standort kollidiert mit Gebäude ${matched.get(key)} derselben Leitstelle.`;
          f = undefined;
        } else if (
          meters(f.access!.pos, b.pos) > 0.5 &&
          raw.vehicles.some(
            (v: { home: string; destination?: string; status: string }) =>
              (v.home === b.id || v.destination === b.id) &&
              ["alarmed", "travel", "return", "transport"].includes(v.status),
          )
        ) {
          reason =
            "Laufende Fahrt berührt diesen Standort. Vor Migration am bisherigen Server beenden; keine Versetzung laufender Fahrzeuge.";
          f = undefined;
        } else matched.set(key, b.id);
      }
      if (f)
        changes.push({
          owner,
          building: b.id,
          facility: f.id,
          reason,
          name: b.name,
          position: p,
          targetName: f.name,
          targetPosition: unproject(f.pos),
        });
      else
        conflicts.push({
          owner,
          building: b.id,
          name: b.name,
          type: b.type,
          position: p,
          reason,
          candidates: candidates.map((f) => f.id),
          candidateDetails: candidates.map((f) => ({
            id: f.id,
            name: f.name,
            distanceMeters: Math.round(meters(f.pos, b.pos)),
            position: unproject(f.pos),
            status: f.status,
            hasAccess: !!f.access,
            sources: f.sources,
          })),
        });
    }
  // A later legacy building can collide with an already processed target too; the entire apply is blocked.
  for (const resolution of resolutions)
    if (
      !saves.some(
        ({ owner, raw }) =>
          owner === resolution.owner &&
          raw.buildings.some((b: Building) => b.id === resolution.building),
      )
    )
      conflicts.push({
        owner: resolution.owner,
        building: resolution.building,
        name: "",
        reason: "Zuordnungsdatei verweist auf unbekannten Bestand.",
        candidates: [],
      });
  return {
    snapshot: catalog.snapshot,
    changes,
    conflicts,
    ready: !conflicts.length,
  };
}
/** Caller holds the maintenance lock and created a consistent SQLite backup before BEGIN. */
export function applyFacilityMigration(
  sql: DatabaseSync,
  catalog: FacilityCatalog,
  resolutions: FacilityResolution[] = [],
) {
  if (!sql.isTransaction)
    throw Error("Standortmigration benötigt eine Transaktion.");
  const plan = planFacilityMigration(sql, catalog, resolutions);
  if (!plan.ready)
    throw Error(
      `Standortmigration: ${plan.conflicts.length} ungelöste Konflikte. Keine Änderung durchgeführt.`,
    );
  for (const row of storedWorlds(sql)) {
    const s = validate(row.raw);
    let changed = false;
    for (const change of plan.changes.filter((c) => c.owner === row.owner)) {
      const b = s.buildings.find((b) => b.id === change.building)!,
        f = catalog.get(change.facility)!;
      b.facility = facilityBinding(f);
      b.pos = { ...assertFacilityAccess(f).pos };
      for (const v of s.vehicles.filter(
        (v) => v.home === b.id && v.status === "ready",
      ))
        v.path = [{ ...b.pos }];
      changed = true;
    }
    if (changed) {
      s.revision++;
      const checked = validate(s);
      if (row.training)
        sql
          .prepare("UPDATE training_worlds SET payload=? WHERE user_id=?")
          .run(JSON.stringify({ ...row.training, save: checked }), row.key);
      else
        sql
          .prepare("UPDATE saves SET data=? WHERE user_id=?")
          .run(JSON.stringify(checked), row.key);
    }
  }
  return plan;
}
export function assertFacilityMigration(sql: DatabaseSync) {
  for (const row of storedWorlds(sql)) {
    const save = row.raw;
    const conflicts = save.buildings.filter((b: Building) => !b.facility);
    if (conflicts.length)
      throw Error(
        `FACILITY_MIGRATION_REQUIRED: Leitstelle ${row.owner} hat ${conflicts.length} noch nicht zugeordnete Einrichtungen (${conflicts.map((b: Building) => b.name).join(", ")}). Server gestoppt; Bestand erhalten. AMP: App Name vorübergehend „scripts/facilities-maintenance.mjs“ für die schreibfreie Prüfung verwenden. Terminal: „node scripts/facilities-maintenance.mjs“. Danach Zuordnung prüfen und gesicherte Standortmigration ausführen. Anleitung: docs/STANDORTE.md.`,
      );
  }
}
