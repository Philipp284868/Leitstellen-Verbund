import { bt } from "../../shared/catalog";
import { unlocked } from "../../shared/progression-state";
import { z } from "zod";
import { facilityKinds } from "../../shared/facilities/types";
import { germanyProvider } from "../../shared/germany/world";
import { facilityOffer } from "../../shared/facilities/purchase";
import type { PurchaseContext } from "../../shared/facilities/purchase";

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
    return facilityOffer(purchaseContext(), facility);
  }
  const bbox = p.has("bbox")
    ? bboxSchema.parse(p.get("bbox")!.split(",").map(Number))
    : undefined;
  if (p.get("clusters") === "1") {
    if (!bbox) throw Error("Kartenausschnitt fehlt.");
    return {
      snapshot: catalog.snapshot,
      clusters: catalog.clusters(
        bbox,
        z.coerce
          .number()
          .min(4)
          .max(20)
          .parse(p.get("zoom") || 10),
        kind,
      ),
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
  const facilities = catalog.query({
    offset,
    bbox,
    search,
    kind,
    limit: 81,
    ...(status === "owned"
      ? { ids: s.buildings.flatMap((b) => (b.facility ? [b.facility.id] : [])) }
      : {}),
    ...(["available", "locked"].includes(status)
      ? {
          offerFilter: {
            available: status === "available",
            owned: s.buildings.flatMap((b) =>
              b.facility ? [b.facility.id] : [],
            ),
            kinds: facilityKinds.filter(
              (kind) =>
                kind !== "other" &&
                s.buildings.length < 150 &&
                unlocked(s, "building", kind) &&
                s.money >= bt(kind).price,
            ),
          },
        }
      : {}),
  });
  const offers = facilities
    .map((f) => facilityOffer(s, f))
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
      },
    })),
    limit: 80,
    nextOffset: facilities.length > 80 ? offset + 80 : null,
  };
}
