import { BALANCE, bt } from "../catalog";
import type { Save } from "../model";
import { progress } from "../progression";
import { bookMoney } from "../economy/ledger";
import { germanyProvider } from "../germany/world";
import { simId } from "../simulation/events";
import { newStationProfile } from "../simulation/staffing";
import { reconcileBuildingStaffing } from "../simulation/building-staffing";
import type { Facility } from "./types";

export function facilityOffer(s: Save, facility: Facility) {
  const owned = s.buildings.find((b) => b.facility?.id === facility.id);
  const type = facility.kind === "other" ? undefined : bt(facility.kind);
  const reason = owned
    ? "Bereits von deiner Leitstelle erworben."
    : facility.status !== "active"
      ? "Standort benötigt eine Datenprüfung oder ist nicht aktiv."
      : !type
        ? "Einrichtungstyp ist nicht als operative Wache belegt."
        : !facility.access
          ? "Zufahrt nicht hinreichend belegt. Dieser Standort kann noch nicht erworben werden."
          : s.buildings.length >= 150
            ? "Höchstens 150 verwaltete Einrichtungen pro Leitstelle."
            : progress(s.xp).level < type.level
              ? `Freischaltung ab Stufe ${type.level}.`
              : s.money < type.price
                ? "Budget reicht für diesen Kauf nicht aus."
                : "";
  return {
    facility,
    price: type?.price ?? 0,
    level: type?.level ?? 1,
    slots: type?.slots ?? 0,
    people: type?.people ?? 0,
    owned: owned?.id,
    reason,
  };
}
export function assertFacilityAccess(facility: Facility) {
  const provider = germanyProvider(),
    access = facility.access;
  if (!access) throw Error("Zufahrt nicht hinreichend belegt.");
  if (facility.kind !== "heli") {
    if (!provider.isLandSite(access.pos))
      throw Error("Zufahrt ist derzeit nicht für Straßenfahrzeuge nutzbar.");
    if (facility.kind === "water" && !provider.isWaterSite?.(access.pos))
      throw Error("Wasserrettungszugang ist noch nicht bestätigt.");
    const neighbor = provider
      .querySites(access.pos, 100, 16)
      .find((p) => Math.hypot(p.x - access.pos.x, p.y - access.pos.y) > 3);
    if (!neighbor)
      throw Error(
        "Zufahrt hat keine nachgewiesene Verbindung zum Straßennetz.",
      );
    provider.route(access.pos, neighbor, "road", new Set(), 50, new Map(), 1);
    provider.route(neighbor, access.pos, "road", new Set(), 50, new Map(), 1);
  }
}
export function purchaseFacility(s: Save, id: string) {
  const provider = germanyProvider();
  const facility = provider.facilities?.get(id);
  if (!facility)
    throw Error("Standort ist im geprüften Katalog nicht vorhanden.");
  // Repeated purchase requests, even with a new command UUID, never charge twice.
  if (s.buildings.some((b) => b.facility?.id === facility.id)) return;
  const offer = facilityOffer(s, facility);
  if (offer.reason) throw Error(offer.reason);
  const access = facility.access!;
  assertFacilityAccess(facility);
  const buildingId = simId(s);
  bookMoney(
    s,
    -offer.price,
    `Standortkauf: ${(facility.name || bt(facility.kind).name).slice(0, 140)}`,
  );
  s.buildings.push({
    id: buildingId,
    owner: s.player.id,
    type: facility.kind,
    name: (facility.name || bt(facility.kind).name).slice(0, 48),
    purchasePriceCents: offer.price,
    pos: { ...access.pos },
    level: 1,
    ready:
      facility.kind === "hospital" ? s.time : s.time + BALANCE.buildSeconds,
    extensions: [],
    organization: newStationProfile(facility.kind),
    facility: {
      id: facility.id,
      snapshot: facility.snapshot,
      sources: facility.sources,
      position: facility.pos,
      emergency: facility.emergency,
      subtype: facility.subtype,
    },
  });
  s.tutorial = Math.max(1, s.tutorial);
  const building = s.buildings.at(-1)!;
  if (facility.subtype === "BF" && building.organization)
    building.organization.kind = "bf";
  if (facility.kind === "hospital") {
    const previous = new Set([
      `public:${facility.id}`,
      ...facility.sources.map((ref) => `public:${ref}`),
    ]);
    for (const bed of s.beds) if (previous.has(bed.home)) bed.home = buildingId;
    for (const vehicle of s.vehicles)
      if (vehicle.destination && previous.has(vehicle.destination))
        vehicle.destination = buildingId;
  }
  reconcileBuildingStaffing(s);
}
