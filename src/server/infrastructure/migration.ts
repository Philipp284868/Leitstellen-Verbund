import type { DatabaseSync } from "node:sqlite";
import type { Save } from "../../shared/model";
import { createHash } from "node:crypto";
import { validate } from "../../shared/model";
import { germanyProvider } from "../../shared/germany/world";
import { bookMoney } from "../../shared/economy/ledger";
import { prepareLegacyClinics } from "./legacy-clinics";
import { INFRASTRUCTURE_SCHEMA } from "./schema";
import { persistExclusiveOwnership } from "./ownership";

export type InfrastructureResolution = {
  owner: string;
  building: string;
  purchasedAt: number;
  paidCents: number;
  evidence: string;
};
type Candidate = {
  owner: string;
  building: string;
  facility: string;
  name: string;
  kind: string;
  purchaseAt?: number;
  paidCents?: number;
  evidence?: string;
  vehicles: number;
  people: number;
  patients: number;
  transports: number;
  beds: number;
};
const marker = "shared-infrastructure-v1";
export function infrastructureMigrated(sql: DatabaseSync) {
  return !!sql.prepare("SELECT 1 FROM meta WHERE key=?").get(marker);
}
/** Read-only and deterministic; never choose a winner by account/row order. */
export function planInfrastructureMigration(
  sql: DatabaseSync,
  resolutions: InfrastructureResolution[] = [],
) {
  const saves = sql
    .prepare("SELECT user_id,data FROM saves ORDER BY user_id")
    .all()
    .map((r) => ({
      owner: String(r.user_id),
      s: JSON.parse(String(r.data)) as Save,
    }));
  const entries: Candidate[] = [],
    conflicts: { owner: string; building: string; reason: string }[] = [];
  const removed = new Set<string>();
  const catalog = germanyProvider().facilities;
  if (infrastructureMigrated(sql))
    return {
      version: 1,
      ready: true,
      applied: true,
      entries,
      conflicts,
      removals: [] as Candidate[],
      clinicPlaces: { reserved: 0, occupied: 0 },
    };
  for (const { owner, s } of saves)
    for (const b of s.buildings) {
      if (b.migrationReserve) continue;
      if (!b.facility) {
        conflicts.push({
          owner,
          building: b.id,
          reason:
            "FACILITY_MIGRATION_REQUIRED: Reale Standortzuordnung zuerst über facilities-preview / facilities-migrate klären.",
        });
        continue;
      }
      const f = catalog?.get(b.facility.id);
      if (!f || f.kind !== b.type) {
        conflicts.push({
          owner,
          building: b.id,
          reason:
            "Kanonischer Katalogstandort fehlt oder Organisation widerspricht dem Bestand.",
        });
        continue;
      }
      const aliases = new Set([
        b.id,
        `public:${f.id}`,
        ...f.sources.map((x) => `public:${x}`),
      ]);
      const override = resolutions.filter(
        (r) => r.owner === owner && r.building === b.id,
      );
      const receipt = b.purchaseReceipt;
      const text = `Standortkauf: ${(f.name || b.name).slice(0, 140)}`;
      const journal = s.journal.filter(
        (j) =>
          j.text === text && j.amount < 0 && -j.amount === b.purchasePriceCents,
      );
      // An unlinked aggregate book value or a catalog list price is not proof of money paid.
      const uniqueName =
        s.buildings.filter(
          (other) =>
            other.facility && catalog?.get(other.facility.id)?.name === f.name,
        ).length === 1;
      const purchase = receipt
        ? { at: receipt.at, amount: receipt.amount, id: receipt.id }
        : journal.length === 1 && uniqueName
          ? { at: journal[0].at, amount: -journal[0].amount, id: journal[0].id }
          : undefined;
      const investments = b.investmentReceipts ?? [];
      const investmentCount =
        b.level -
        1 +
        b.extensions.length +
        (b.organization?.kind === "bf" && f.subtype !== "BF" ? 1 : 0);
      const upgradesKnown = investments.length >= investmentCount;
      const entry: Candidate = {
        owner,
        building: b.id,
        facility: f.id,
        name: b.name,
        kind: b.type,
        purchaseAt: purchase?.at,
        paidCents:
          purchase && upgradesKnown
            ? purchase.amount + investments.reduce((n, r) => n + r.amount, 0)
            : undefined,
        evidence: purchase
          ? `Kaufbeleg ${purchase.id}${investments.length ? "; Investitionsbelege " + investments.map((i) => i.id).join(",") : ""}`
          : undefined,
        vehicles: s.vehicles.filter((v) => v.home === b.id).length,
        people: s.people.filter((p) => p.home === b.id).length,
        patients: s.missions
          .flatMap((m) => m.dynamics?.patients ?? [])
          .filter((p) => aliases.has(p.hospital ?? "")).length,
        transports: s.vehicles.filter(
          (v) => v.status === "transport" && aliases.has(v.destination ?? ""),
        ).length,
        beds: s.beds.filter((bed) => aliases.has(bed.home)).length,
      };
      if (
        override.length === 1 &&
        override[0].evidence.trim().length >= 20 &&
        Number.isSafeInteger(override[0].paidCents) &&
        override[0].paidCents >= 0 &&
        Number.isFinite(override[0].purchasedAt) &&
        override[0].purchasedAt >= 0
      ) {
        entry.purchaseAt = override[0].purchasedAt;
        entry.paidCents = override[0].paidCents;
        entry.evidence = override[0].evidence;
      } else if (override.length)
        conflicts.push({
          owner,
          building: b.id,
          reason: "Ungültige oder mehrdeutige belegte Betreiberentscheidung.",
        });
      entries.push(entry);
    }
  const groups = new Map<string, Candidate[]>();
  for (const entry of entries) {
    const group = groups.get(entry.facility) ?? [];
    group.push(entry);
    groups.set(entry.facility, group);
  }
  for (const group of groups.values()) {
    if (group[0].kind === "hospital") {
      for (const e of group) removed.add(e.owner + ":" + e.building);
      continue;
    }
    if (group.length === 1) continue;
    if (group.some((e) => e.purchaseAt === undefined)) {
      for (const e of group)
        conflicts.push({
          owner: e.owner,
          building: e.building,
          reason:
            "Doppelbesitz: nicht alle ursprünglichen Kaufzeitpunkte sind eindeutig belegt.",
        });
      continue;
    }
    const first = Math.min(...group.map((e) => e.purchaseAt!));
    if (group.filter((e) => e.purchaseAt === first).length !== 1) {
      for (const e of group)
        conflicts.push({
          owner: e.owner,
          building: e.building,
          reason:
            "Doppelbesitz: gleichzeitige früheste Kaufbelege; ausdrückliche, belegte Klärung erforderlich.",
        });
      continue;
    }
    for (const e of group)
      if (e.purchaseAt !== first) removed.add(e.owner + ":" + e.building);
  }
  const removals = entries.filter((e) =>
    removed.has(e.owner + ":" + e.building),
  );
  for (const e of removals)
    if (e.paidCents === undefined || !e.evidence)
      conflicts.push({
        owner: e.owner,
        building: e.building,
        reason:
          "Tatsächlich gezahlter Kauf-/Ausbaubetrag nicht vollständig belegt. Keine pauschale Erstattung.",
      });
  const clinics = prepareLegacyClinics(saves.map((row) => row.s));
  conflicts.push(...clinics.conflicts);
  return {
    version: 1,
    ready: !conflicts.length,
    applied: false,
    entries,
    removals,
    conflicts,
    clinicPlaces: {
      reserved: clinics.places.filter((p) => p.state === "reserved").length,
      occupied: clinics.places.filter((p) => p.state === "occupied").length,
    },
  };
}

export function applyInfrastructureMigration(
  sql: DatabaseSync,
  resolutions: InfrastructureResolution[] = [],
) {
  if (!sql.isTransaction)
    throw Error("Infrastrukturmigration benötigt eine gesicherte Transaktion.");
  const plan = planInfrastructureMigration(sql, resolutions);
  if (plan.applied) return plan;
  if (!plan.ready)
    throw Error("INFRASTRUCTURE_MIGRATION_REQUIRED: " + JSON.stringify(plan));
  sql.exec(INFRASTRUCTURE_SCHEMA);
  const rows = sql
    .prepare("SELECT user_id,data FROM saves ORDER BY user_id")
    .all();
  const originals = new Map(
    rows.map((row) => [String(row.user_id), String(row.data)]),
  );
  const clinics = prepareLegacyClinics(
    rows.map((row) => JSON.parse(String(row.data)) as Save),
  );
  if (clinics.conflicts.length)
    throw Error(
      "INFRASTRUCTURE_MIGRATION_REQUIRED: " + JSON.stringify(clinics.conflicts),
    );
  for (const s of clinics.saves) {
    for (const change of plan.removals.filter((e) => e.owner === s.player.id)) {
      const b = s.buildings.find((b) => b.id === change.building)!;
      const id = `infrastructure:${createHash("sha256").update(`${s.player.id}:${b.id}`).digest("hex")}`;
      const inserted = sql
        .prepare(
          "INSERT OR IGNORE INTO infrastructure_refunds VALUES(?,?,?,?,?)",
        )
        .run(id, s.player.id, b.id, change.paidCents!, change.evidence!);
      if (inserted.changes)
        bookMoney(s, change.paidCents!, `Migrationskorrektur: ${b.name}`, id);
      b.migrationReserve = {
        facility: change.facility,
        reason:
          b.type === "hospital"
            ? "In Serverklinik überführt"
            : "Exklusiver Standort: früherer belegter Kauf hat Vorrang",
        refundedCents: change.paidCents!,
      };
      delete b.facility;
      delete b.hospital;
      // Preserve all active routes, vehicles, equipment and staff. A reserve has no operating rights.
      sql
        .prepare("DELETE FROM facility_rights WHERE owner=? AND building=?")
        .run(s.player.id, b.id);
    }

    if (JSON.stringify(s) !== originals.get(s.player.id)) s.revision++;
    const checked = validate(s);
    sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(checked), s.player.id);
    persistExclusiveOwnership(sql, checked);
  }
  const insert = sql.prepare(
    "INSERT INTO clinic_places VALUES(?,?,?,?,?,?,?,?,?,?,0)",
  );
  for (const p of clinics.places)
    insert.run(
      p.patient,
      p.clinic,
      p.owner,
      p.mission,
      p.transport,
      JSON.stringify(p.departments),
      p.state,
      p.created,
      p.admitted,
      p.discharge,
    );
  sql
    .prepare("INSERT INTO meta(key,value) VALUES(?,?)")
    .run(marker, JSON.stringify(plan));
  return plan;
}
