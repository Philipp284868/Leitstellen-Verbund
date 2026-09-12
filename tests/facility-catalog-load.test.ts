import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createFacilityLoad } from "./helpers/facility-load";
import { SqliteFacilityCatalog } from "../src/server/facilities/catalog";

it("summarizes the entire dense/country viewport without the old 2000-row truncation and paginates stable lists", () => {
  const path = resolve(
    mkdtempSync(resolve(tmpdir(), "lv-catalog-load-")),
    "facilities.sqlite",
  );
  createFacilityLoad(path, 6000);
  const catalog = new SqliteFacilityCatalog(path, "load");
  try {
    const country = catalog.clusters([5, 47, 16, 56], 6);
    expect(country.length).toBeLessThanOrEqual(2000);
    expect(country.reduce((n, c) => n + c.count, 0)).toBe(6000);
    const detailed = catalog.clusters([5, 47, 16, 56], 18);
    expect(detailed.length).toBeLessThanOrEqual(2000);
    expect(detailed.reduce((n, c) => n + c.count, 0)).toBe(6000);
    expect(catalog.clusters([5, 47, 16, 56], 18)).toBe(detailed);
    const a = catalog.query({ search: "Testwache", limit: 80 }),
      b = catalog.query({ search: "Testwache", limit: 80, offset: 80 });
    expect(a).toHaveLength(80);
    expect(b).toHaveLength(80);
    expect(new Set([...a, ...b].map((f) => f.id)).size).toBe(160);
    expect(catalog.get(a[0].id)?.access).toBeDefined();
  } finally {
    catalog.close();
  }
});
