import type { DatabaseSync } from "node:sqlite";
import type { Facility } from "../../shared/facilities/types";
import type { Save } from "../../shared/model";
import { germanyProvider } from "../../shared/germany/world";

export type PublicOwnership = { facility: string; owner: string; name: string };
export function ownershipOf(
  sql: DatabaseSync,
  f: Pick<Facility, "id" | "sources" | "kind">,
): PublicOwnership | undefined {
  const identities = [f.id, ...f.sources];
  const rows = sql
    .prepare(
      `SELECT DISTINCT o.facility,o.owner,u.username name FROM station_ownership o
    JOIN users u ON u.id=o.owner LEFT JOIN station_aliases a ON a.facility=o.facility
    WHERE o.facility=? OR (a.kind=? AND a.source IN (${identities.map(() => "?").join(",")}))`,
    )
    .all(f.id, f.kind, ...identities);
  if (rows.length > 1)
    return {
      facility: f.id,
      owner: "catalog-conflict",
      name: "ungeklärtem Altbesitz – Betreiberprüfung erforderlich",
    };
  const r = rows[0];
  return r
    ? {
        facility: String(r.facility),
        owner: String(r.owner),
        name: String(r.name),
      }
    : undefined;
}
/** Called after authorization/price checks, in the same transaction as the debit/save. */
export function persistExclusiveOwnership(sql: DatabaseSync, s: Save) {
  if (!sql.isTransaction)
    throw Error("Besitzänderung benötigt eine Transaktion.");
  const catalog = germanyProvider().facilities;
  for (const b of s.buildings.filter(
    (b) => b.facility && !b.migrationReserve,
  )) {
    if (b.type === "hospital")
      throw Error(
        "Krankenhäuser gehören dem Server und können nicht gekauft werden.",
      );
    const f = catalog?.get(b.facility!.id);
    if (!f || f.kind !== b.type)
      throw Error(
        "Kanonischer Standort fehlt oder die Organisation stimmt nicht überein.",
      );
    const current = ownershipOf(sql, {
      ...f,
      sources: [...f.sources, ...b.facility!.sources],
    });
    if (current?.owner === "catalog-conflict") {
      // Preserve an existing paid holding during targeted evidence review. This
      // grants no new ownership and cannot be reached by a new catalog purchase.
      const historic = sql
        .prepare("SELECT 1 FROM station_ownership WHERE owner=? AND building=?")
        .get(s.player.id, b.id);
      if (historic) continue;
      throw Error(
        "STATION_IDENTITY_CONFLICT: Standort bis zur belegten Klärung nicht erneut kaufbar.",
      );
    }
    if (current && current.owner !== s.player.id)
      throw Error(`Standort bereits von ${current.name} erworben.`);
    const prior = sql
      .prepare("SELECT building FROM station_ownership WHERE facility=?")
      .get(current?.facility ?? f.id);
    if (prior && prior.building !== b.id)
      throw Error("Dieser reale Standort besitzt bereits eine Wache.");
    if (!prior) {
      sql
        .prepare("INSERT INTO station_ownership VALUES(?,?,?,?,?,?)")
        .run(
          f.id,
          s.player.id,
          b.id,
          b.type,
          b.purchaseReceipt?.at ?? null,
          b.purchaseReceipt?.id ?? null,
        );
      sql.exec(
        "UPDATE infrastructure_state SET revision=revision+1 WHERE id=1",
      );
    }
    for (const source of new Set([f.id, ...f.sources, ...b.facility!.sources]))
      sql
        .prepare(
          "INSERT INTO station_aliases VALUES(?,?,?) ON CONFLICT(source,kind) DO NOTHING",
        )
        .run(source, f.kind, current?.facility ?? f.id);
  }
  for (const r of sql
    .prepare("SELECT facility,building FROM station_ownership WHERE owner=?")
    .all(s.player.id))
    if (!s.buildings.some((b) => b.id === r.building && !b.migrationReserve)) {
      sql
        .prepare("DELETE FROM station_ownership WHERE facility=?")
        .run(r.facility);
      sql.exec(
        "UPDATE infrastructure_state SET revision=revision+1 WHERE id=1",
      );
    }
}

/** One bounded indexed join, never another owner's save. */
export function publicOwnership(sql: DatabaseSync, ids: string[]) {
  if (!ids.length) return [];
  if (ids.length > 2000) throw Error("Zu viele Standortkennungen.");
  const catalog = germanyProvider().facilities;
  const requests = [...new Set(ids)].flatMap((id) => {
    const f = catalog?.get(id);
    return f ? [{ id: f.id, kind: f.kind, sources: [f.id, ...f.sources] }] : [];
  });
  return sql
    .prepare(
      `WITH requests AS(SELECT json_extract(value,'$.id') id,json_extract(value,'$.kind') kind,json_extract(value,'$.sources') sources FROM json_each(?))
       SELECT r.id facility,CASE WHEN COUNT(DISTINCT o.facility)>1 THEN 'catalog-conflict' ELSE MIN(o.owner) END owner,
       CASE WHEN COUNT(DISTINCT o.facility)>1 THEN 'ungeklärtem Altbesitz – Betreiberprüfung erforderlich' ELSE MIN(u.username) END name FROM requests r
       JOIN station_aliases a ON a.kind=r.kind AND a.source IN(SELECT value FROM json_each(r.sources))
       JOIN station_ownership o ON o.facility=a.facility JOIN users u ON u.id=o.owner GROUP BY r.id`,
    )
    .all(JSON.stringify(requests))
    .map((r) => ({
      facility: String(r.facility),
      owner: String(r.owner),
      name: String(r.name),
    }));
}
