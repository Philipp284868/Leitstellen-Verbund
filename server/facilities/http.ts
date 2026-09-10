import { z } from "zod";
import { facilityKinds } from "../../src/facilities/types";
import { germanyProvider } from "../../src/germany/world";
import { facilityOffer } from "../../src/facilities/purchase";
import type { Save } from "../../src/model";

const bboxSchema = z
  .tuple([
    z.number().min(-180).max(180),
    z.number().min(-85).max(85),
    z.number().min(-180).max(180),
    z.number().min(-85).max(85),
  ])
  .refine(([w, s, e, n]) => w < e && s < n);
export function facilityResponse(url: URL, s: Save) {
  const catalog = germanyProvider().facilities;
  if (!catalog)
    throw Error("Geprüfter Standortkatalog fehlt. Installation aktualisieren.");
  const p = url.searchParams;
  const kind = p.get("kind")
    ? z.enum(facilityKinds).parse(p.get("kind"))
    : undefined;
  if (p.has("id")) {
    const facility = catalog.get(z.string().min(1).max(100).parse(p.get("id")));
    if (!facility) throw Error("Standort nicht gefunden.");
    return facilityOffer(s, facility);
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
  const search = z
    .string()
    .max(120)
    .parse(p.get("q") || "");
  const status = z
    .enum(["all", "owned", "available", "locked"])
    .parse(p.get("status") || "all");
  const facilities = catalog.query({
    bbox,
    search,
    kind,
    limit: 200,
    ...(status === "owned"
      ? { ids: s.buildings.flatMap((b) => (b.facility ? [b.facility.id] : [])) }
      : {}),
    ...(status === "available" ? { usable: true } : {}),
  });
  const offers = facilities
    .map((f) => facilityOffer(s, f))
    .filter((o) =>
      status === "all" || status === "owned" || status === "available"
        ? status !== "available" || !o.reason
        : !!o.reason && !o.owned,
    )
    .slice(0, 80);
  return { snapshot: catalog.snapshot, offers, limit: 80 };
}
