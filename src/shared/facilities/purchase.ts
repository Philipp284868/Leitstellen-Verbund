import { BALANCE, bt } from "../catalog";
import type { Save } from "../model";
import { unlocked } from "../progression-state";
import { bookMoney } from "../economy/ledger";
import { germanyProvider } from "../germany/world";
import { simId } from "../../simulation/events";
import { newStationProfile } from "../../simulation/staffing";
import { reconcileBuildingStaffing } from "../../simulation/building-staffing";
import type { Facility } from "./types";
import { fireGameProfile, fireQuote } from "./fire-profile";
import { progress } from "../progression";
import { GermanyRoutingError } from "../germany/errors";
import type { ClinicSnapshot } from "../../simulation/clinic-capacity";
import type { HospitalOption } from "../../simulation/hospital-profiles";
export type FacilityOwner = { facility: string; owner: string; name: string };

export type PurchaseContext = Pick<Save, "money" | "xp" | "progression"> & {
  buildings: {
    id: string;
    type?: string;
    migrationReserve?: unknown;
    facility?: { id: string; sources?: string[] };
  }[];
};
export function facilityOffer(
  s: PurchaseContext,
  facility: Facility,
  ownership?: FacilityOwner,
  clinic?: HospitalOption & ClinicSnapshot,
) {
  const owned = s.buildings.find(
    (b) =>
      !b.migrationReserve &&
      b.facility &&
      (b.facility.id === facility.id ||
        (b.type === facility.kind &&
          b.facility.sources?.some((source) =>
            facility.sources.includes(source),
          ))),
  );
  const type = facility.kind === "other" ? undefined : bt(facility.kind);
  const fire =
    facility.kind === "fire"
      ? fireGameProfile(facility.fireProfile)
      : undefined;
  const price = fire?.price ?? type?.price ?? 0;
  const reason =
    facility.kind === "hospital"
      ? "Serverkrankenhaus · gemeinsame Aufnahme, nicht käuflich."
      : owned
        ? "Bereits von deiner Leitstelle erworben."
        : ownership
          ? `Standort bereits von ${ownership.name} erworben.`
          : facility.status !== "active"
            ? "Standort benötigt eine Datenprüfung oder ist nicht aktiv."
            : !type
              ? "Einrichtungstyp ist nicht als operative Wache belegt."
              : facility.kind === "fire" && !fire
                ? "Feuerwehr – Wachtyp ungeklärt. Neues Kaufangebot erst nach belegter Zuordnung."
                : !facility.access
                  ? "Zufahrt nicht hinreichend belegt. Dieser Standort kann noch nicht erworben werden."
                  : s.buildings.length >= 150
                    ? "Höchstens 150 verwaltete Einrichtungen pro Leitstelle."
                    : !unlocked(s, "building", type.id)
                      ? `Freischaltung ab Stufe ${type.level}.`
                      : fire && progress(s.xp).level < fire.level
                        ? `Wachprofil ab Stufe ${fire.level}.`
                        : s.money < price
                          ? "Budget reicht für diesen Kauf nicht aus."
                          : "";
  return {
    facility,
    price,
    quote: fireQuote(facility.fireProfile),
    level: fire?.level ?? type?.level ?? 1,
    slots: fire?.slots ?? type?.slots ?? 0,
    people: fire?.people ?? type?.people ?? 0,
    owned: owned?.id,
    ownership,
    clinic,
    reason,
  };
}
export function assertFacilityAccess(facility: Facility) {
  const provider = germanyProvider();
  if (!facility.access) throw Error("Zufahrt nicht hinreichend belegt.");
  if (facility.kind === "heli") return facility.access;
  let failure = "Keine geprüfte Zufahrt hat eine nutzbare Straßenverbindung.";
  for (const access of [
    facility.access,
    ...(facility.accessAlternatives ?? []),
  ].slice(0, 5)) {
    try {
      if (!provider.isLandSite(access.pos)) continue;
      if (
        access.method === "nearby-service-road" &&
        [0.25, 0.5, 0.75].some(
          (t) =>
            !provider.isLandSite({
              x: facility.pos.x + (access.pos.x - facility.pos.x) * t,
              y: facility.pos.y + (access.pos.y - facility.pos.y) * t,
            }),
        )
      )
        continue;
      if (facility.kind === "water" && !provider.isWaterSite?.(access.pos)) {
        failure = "Wasserrettungszugang ist noch nicht bestätigt.";
        continue;
      }
      const neighbors = provider
        .querySites(access.pos, 100, 16)
        .filter((p) => Math.hypot(p.x - access.pos.x, p.y - access.pos.y) > 3)
        .slice(0, 3);
      for (const neighbor of neighbors)
        try {
          provider.route(
            access.pos,
            neighbor,
            "road",
            new Set(),
            50,
            new Map(),
            1,
          );
          provider.route(
            neighbor,
            access.pos,
            "road",
            new Set(),
            50,
            new Map(),
            1,
          );
          return access;
        } catch (error) {
          if (
            !(error instanceof GermanyRoutingError) ||
            error.code === "unavailable"
          )
            throw error;
          failure = error.message;
        }
    } catch (error) {
      if (
        !(error instanceof GermanyRoutingError) ||
        error.code === "unavailable"
      )
        throw error;
      failure = error.message;
    }
  }
  throw Error(`Keine erreichbare Zufahrt: ${failure}`);
}
export function purchaseFacility(s: Save, id: string, quote?: string) {
  const provider = germanyProvider();
  const facility = provider.facilities?.get(id);
  if (!facility)
    throw Error("Standort ist im geprüften Katalog nicht vorhanden.");
  // Repeated purchase requests, even with a new command UUID, never charge twice.
  const offer = facilityOffer(s, facility);
  if (offer.owned) return;
  if (offer.reason) throw Error(offer.reason);
  if (offer.quote && quote !== offer.quote)
    throw Error(
      "Wachprofil oder Preisstand nicht bestätigt. Standort erneut öffnen und den aktuellen Preis prüfen.",
    );
  const access = assertFacilityAccess(facility);
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
    purchaseReceipt: {
      id: s.journal[0].id,
      at: s.journal[0].at,
      amount: offer.price,
    },
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
  const building = s.buildings.at(-1)!;
  if (facility.fireProfile)
    building.fireProfile = structuredClone(facility.fireProfile);
  if (facility.subtype === "BF" && building.organization)
    building.organization.kind = "bf";
  if (
    building.organization &&
    ["works", "company", "airport"].includes(facility.subtype)
  )
    building.organization.kind = facility.subtype as
      | "works"
      | "company"
      | "airport";
  reconcileBuildingStaffing(s);
}
