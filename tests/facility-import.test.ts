import { describe, expect, it } from "vitest";
import {
  classifyFacility,
  sameFacility,
} from "../scripts/geodata/facility-classification.mjs";
import { normalizeFacilities } from "../scripts/geodata/facility-catalog.mjs";

const area = {
  source: "relation:1",
  tags: {
    amenity: "hospital",
    name: "Klinikum Beispiel",
    operator: "Beispielbetrieb",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [13, 52],
        [13.01, 52],
        [13.01, 52.01],
        [13, 52.01],
        [13, 52],
      ],
    ],
  },
  lon: 13.005,
  lat: 52.005,
  state: "DE-BE",
  members: ["way:2"],
  entrances: [],
};
const point = {
  ...area,
  source: "node:3",
  geometry: { type: "Point", coordinates: [13.005, 52.005] },
  members: [],
};
describe("nachvollziehbarer Einrichtungskatalog", () => {
  it("vereinigt Krankenhauskennzeichnungen sowie Punkte, Flächen und Relationsmitglieder derselben Einrichtung", () => {
    const way = { ...area, source: "way:2", members: [] };
    const records = normalizeFacilities([point, way, area], {
      snapshot: "2026-09-07",
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "osm:relation:1",
      kind: "hospital",
      sources: ["relation:1", "way:2", "node:3"],
    });
    expect(classifyFacility({ healthcare: "hospital" })?.kind).toBe("hospital");
  });
  it("hält Rettungswache und Krankenhaus auf demselben Campus sowie benachbarte gleichnamige Wachen getrennt", () => {
    const ambulance = {
      ...point,
      source: "node:4",
      tags: { emergency: "ambulance_station", name: "Klinikum Beispiel" },
    };
    expect(normalizeFacilities([area, point, ambulance])).toHaveLength(2);
    expect(
      sameFacility(
        { ...point, kind: "hospital" },
        { ...point, source: "node:5", kind: "hospital", lon: 13.005001 },
      ),
    ).toBe(false);
  });
  it("rät weder THW, Notarzt, BF noch Spezialklinik aus Namen und verkauft keine inaktiven Einrichtungen", () => {
    expect(
      classifyFacility({ amenity: "fire_station", name: "Berufsfeuerwehr" })
        ?.subtype,
    ).toBe("unknown");
    expect(
      classifyFacility({ emergency: "ambulance_station", name: "Notarztbasis" })
        ?.subtype,
    ).toBe("unknown");
    expect(
      classifyFacility({ emergency: "disaster_response", name: "THW" })?.kind,
    ).toBe("kats");
    expect(
      classifyFacility({
        emergency: "disaster_response",
        operator: "Bundesanstalt Technisches Hilfswerk",
        "ref:thw": "OBE1",
      })?.kind,
    ).toBe("thw");
    expect(
      classifyFacility({ amenity: "hospital", construction: "yes" })?.status,
    ).toBe("inactive");
    expect(
      classifyFacility({ amenity: "police", police: "storage" })?.kind,
    ).toBe("other");
    expect(
      classifyFacility({ emergency: "lifeguard", lifeguard: "base" })?.kind,
    ).toBe("water");
  });
  it("behält IDs bei Namensänderungen und Quellenwechsel mit gemeinsamer Referenz; entfernte Einträge bleiben prüfbar", () => {
    const old = normalizeFacilities([area, point], { snapshot: "old" });
    const updated = normalizeFacilities(
      [{ ...point, tags: { amenity: "hospital", name: "Neuer Klinikname" } }],
      { snapshot: "new", previous: old },
    );
    expect(updated[0].id).toBe(old[0].id);
    const missing = normalizeFacilities([], {
      snapshot: "next",
      previous: updated,
    });
    expect(missing[0]).toMatchObject({ id: old[0].id, status: "review" });
    expect(() =>
      normalizeFacilities([], {
        supplemental: [{ id: "supplement:unlicensed" }],
      }),
    ).toThrow(/license/);
  });
});
