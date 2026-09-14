import { bt } from "../../shared/catalog";
import { unlocked } from "../../shared/progression-state";
import { z } from "zod";
import { facilityKinds } from "../../shared/facilities/types";
import { germanyProvider } from "../../shared/germany/world";
import { facilityOffer } from "../../shared/facilities/purchase";
import type { PurchaseContext } from "../../shared/facilities/purchase";
import type { FacilityOwner } from "../../shared/facilities/purchase";
import type { Facility } from "../../shared/facilities/types";
import type { HospitalOption } from "../../simulation/hospital-profiles";
import type { ClinicSnapshot } from "../../simulation/clinic-capacity";
import {
  FIRE_GAME_PROFILES,
  fireProfileKinds,
} from "../../shared/facilities/fire-profile";
import { progress } from "../../shared/progression";

const bboxSchema = z
  .tuple([
    z.number().min(-180).max(180),
    z.number().min(-85).max(85),
    z.number().min(-180).max(180),
    z.number().min(-85).max(85),
  ])
  .refine(([w, s, e, n]) => w < e && s < n);
export function facilityResponse(
  url: URL,
  context: PurchaseContext | (() => PurchaseContext),
  services?: {
    ownership: (ids: string[]) => FacilityOwner[];
    clinic: (f: Facility) => HospitalOption & ClinicSnapshot;
  },
) {
  const catalog = germanyProvider().facilities;
  if (!catalog)
    throw Error("Geprüfter Standortkatalog fehlt. Installation aktualisieren.");
  const p = url.searchParams;
  const kind = p.get("kind")
    ? z.enum(facilityKinds).parse(p.get("kind"))
    : undefined;
  const purchaseContext = () =>
    typeof context === "function" ? context() : context;
  if (p.has("id")) {
    const facility = catalog.get(z.string().min(1).max(100).parse(p.get("id")));
    if (!facility) throw Error("Standort nicht gefunden.");
    return facilityOffer(
      purchaseContext(),
      facility,
      services?.ownership([facility.id])[0],
      facility.kind === "hospital" ? services?.clinic(facility) : undefined,
    );
  }
  const bbox = p.has("bbox")
    ? bboxSchema.parse(p.get("bbox")!.split(",").map(Number))
    : undefined;
  if (p.get("clusters") === "1") {
    if (!bbox) throw Error("Kartenausschnitt fehlt.");
    const clusters = catalog.clusters(
      bbox,
      z.coerce
        .number()
        .min(4)
        .max(20)
        .parse(p.get("zoom") || 10),
      kind,
    );
    return {
      snapshot: catalog.snapshot,
      clusters,
    };
  }
  const s = purchaseContext();
  const search = z
    .string()
    .max(120)
    .parse(p.get("q") || "");
  const status = z
    .enum(["all", "owned", "available", "locked"])
    .parse(p.get("status") || "all");
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .parse(p.get("offset") || 0);
  const fireKind = p.get("fireKind")
    ? z.enum(fireProfileKinds).parse(p.get("fireKind"))
    : undefined;
  const facilities = catalog.query({
    offset,
    bbox,
    search,
    kind,
    ...(fireKind ? { fireKinds: [fireKind] } : {}),
    limit: 81,
    ...(status === "owned"
      ? { ids: s.buildings.flatMap((b) => (b.facility ? [b.facility.id] : [])) }
      : {}),
    ...(["available", "locked"].includes(status)
      ? {
          offerFilter: {
            available: status === "available",
            fireKinds: fireProfileKinds.filter(
              (k) =>
                k !== "unknown" &&
                FIRE_GAME_PROFILES[k].level <= progress(s.xp).level &&
                FIRE_GAME_PROFILES[k].price <= s.money,
            ),
            owned: s.buildings.flatMap((b) =>
              b.facility ? [b.facility.id] : [],
            ),
            kinds: facilityKinds.filter(
              (kind) =>
                kind !== "other" &&
                kind !== "hospital" &&
                s.buildings.length < 150 &&
                unlocked(s, "building", kind) &&
                (kind === "fire"
                  ? s.money >= FIRE_GAME_PROFILES.ff.price
                  : s.money >= bt(kind).price),
            ),
          },
        }
      : {}),
  });
  const ownership = new Map(
    (services?.ownership(facilities.map((f) => f.id)) ?? []).map((o) => [
      o.facility,
      o,
    ]),
  );
  const offers = facilities
    .map((f) =>
      facilityOffer(
        s,
        f,
        ownership.get(f.id),
        f.kind === "hospital" ? services?.clinic(f) : undefined,
      ),
    )
    .filter((o) =>
      status === "all" || status === "owned" || status === "available"
        ? status !== "available" || !o.reason
        : !!o.reason && !o.owned,
    )
    .slice(0, 80);
  return {
    snapshot: catalog.snapshot,
    offers: offers.map((o) => ({
      ...o,
      facility: {
        id: o.facility.id,
        kind: o.facility.kind,
        name: o.facility.name,
        address: o.facility.address,
        state: o.facility.state,
        pos: o.facility.pos,
        fireProfile: o.facility.fireProfile,
      },
    })),
    limit: 80,
    nextOffset: facilities.length > 80 ? offset + 80 : null,
  };
}
