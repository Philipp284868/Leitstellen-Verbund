import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteFacilityCatalog } from "../src/server/facilities/catalog";
import { facilityResponse } from "../src/server/facilities/http";
import { fresh } from "../src/shared/model";
import { apply } from "../src/shared/engine";
import { bookMoney } from "../src/shared/economy/ledger";
import {
  germanyProvider,
  installGermanyProvider,
} from "../src/shared/germany/world";
import { createFacilityFixture } from "./fixtures/germany/facility-package";
import { sites, fixtureDataset } from "./fixtures/germany/locations";

it("filtert Kaufstatus, Guthaben und Besitz vor der Ergebnisgrenze des großen Standortkatalogs", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-facility-query-"));
  const original = germanyProvider();
  let catalog: SqliteFacilityCatalog | undefined;
  try {
    createFacilityFixture(dir, {
      positions: Array.from({ length: 240 }, (_, i) => sites[i % sites.length]),
    });
    const file = resolve(dir, "facilities.sqlite"),
      db = new DatabaseSync(file);
    try {
      // More than a full result page of expensive clinics sort before affordable fire stations.
      db.exec(`UPDATE facilities SET name='A Klinik', data=json_set(data,'$.name','A Klinik') WHERE kind='hospital';
        UPDATE facilities SET name='Z Feuerwache', data=json_set(data,'$.name','Z Feuerwache') WHERE kind='fire';
        UPDATE facilities SET usable=0, data=json_set(data,'$.status','review') WHERE id='fixture:fire:239';
        INSERT INTO facilities_fts(facilities_fts) VALUES('rebuild');`);
    } finally {
      db.close();
    }
    catalog = new SqliteFacilityCatalog(file, fixtureDataset);
    installGermanyProvider({ ...original, facilities: catalog });
    const s = fresh("Test", "Test", 1000);
    const query = (params: string) =>
      facilityResponse(new URL(`http://test/api/facilities?${params}`), s) as {
        offers: { facility: { id: string; kind: string }; reason: string }[];
      };
    const available = query("status=available");
    expect(available.offers).toHaveLength(80);
    expect(
      available.offers.every((o) => o.facility.kind === "fire" && !o.reason),
    ).toBe(true);
    expect(
      query("kind=fire&status=locked").offers.map((o) => o.facility.id),
    ).toEqual(["fixture:fire:239"]);
    const id = available.offers[0].facility.id;
    apply(s, { type: "purchase-facility", facility: id });
    expect(query("status=owned").offers.map((o) => o.facility.id)).toEqual([
      id,
    ]);
    expect(
      query("status=available").offers.every((o) => o.facility.id !== id),
    ).toBe(true);
    bookMoney(s, -s.money, "Testbudget verbraucht");
    expect(query("status=available").offers).toEqual([]);
    expect(query("kind=fire&status=locked").offers).toHaveLength(80);
    expect(
      query("kind=fire&status=locked").offers.every(
        (o) => o.facility.id !== id && !!o.reason,
      ),
    ).toBe(true);
  } finally {
    installGermanyProvider(original);
    catalog?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
