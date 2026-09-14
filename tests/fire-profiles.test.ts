import { afterEach, expect, it, vi } from "vitest";
import { fresh, validate } from "../src/shared/model";
import { apply, generate, tick } from "../src/shared/engine";
import {
  fireQuote,
  fireGameProfile,
  type FireProfile,
  FIRE_GAME_PROFILES,
} from "../src/shared/facilities/fire-profile";
import {
  facilityOffer,
  purchaseFacility,
} from "../src/shared/facilities/purchase";
import { germanyProvider } from "../src/shared/germany/world";
import {
  fixtureFacilities,
  fixtureFireProfile,
} from "./fixtures/germany/facilities";
import { reconcileBuildingStaffing } from "../src/simulation/building-staffing";
import {
  stationCapacity,
  crewSummary,
  crewRequired,
  turnoutEstimate,
  personAvailable,
  personDuty,
  planTurnout,
} from "../src/simulation/staffing";
import { catalogFireProfile } from "../src/server/facilities/fire-profiles";
import { alarm } from "../src/simulation/dispatch";
import { attachIncident } from "../src/simulation/calls";
import { xpForLevel } from "../src/shared/progression";
import { organizationCommand } from "../src/simulation/organizations";
import { classifyFireProfile } from "../scripts/geodata/fire-profile-classification.mjs";

afterEach(() => vi.restoreAllMocks());
it("erzeugt für widersprüchliche oder unbelegte Profile keinen typbezogenen Kaufpreis", () => {
  for (const profile of [
    { ...fixtureFireProfile, kind: "bf" as const },
    { ...fixtureFireProfile, employment: "paid" as const },
    { ...fixtureFireProfile, evidence: [] },
    { ...fixtureFireProfile, confidence: "unknown" as const },
  ]) {
    expect(fireGameProfile(profile)).toBeUndefined();
    expect(fireQuote(profile)).toBeUndefined();
  }
});
function station(kind: FireProfile["kind"]) {
  const f = structuredClone(fixtureFacilities.find((f) => f.kind === "fire")!);
  f.fireProfile = {
    ...structuredClone(fixtureFireProfile),
    kind,
    employment:
      kind === "unknown"
        ? "unknown"
        : kind === "ff"
          ? "volunteer"
          : ["ff-paid", "shared"].includes(kind)
            ? "mixed"
            : "paid",
  };
  const catalog = germanyProvider().facilities!;
  const get = catalog.get.bind(catalog);
  vi.spyOn(catalog, "get").mockImplementation((id) =>
    id === f.id ? f : get(id),
  );
  const s = fresh("Profile", "Testleitstelle", Date.UTC(2026, 8, 14, 9) / 1000);
  s.generation = "profile-test-fixed";
  s.seed = 83624;
  s.money = 1e10;
  s.xp = xpForLevel(30);
  return {
    s,
    f,
    buy: () => {
      purchaseFacility(s, f.id, fireQuote(f.fireProfile));
      tick(s, s.buildings[0].ready, {}, false, false);
      return s.buildings[0];
    },
  };
}
it("unterscheidet geprüfte Berliner FF, BF und gemeinsame Einheiten ohne Namensraten", () => {
  expect(catalogFireProfile(["way:1188260526"])).toMatchObject({
    kind: "ff",
    employment: "volunteer",
    confidence: "official",
  });
  expect(catalogFireProfile(["way:704988973"])).toMatchObject({
    kind: "bf",
    employment: "paid",
    confidence: "official",
  });
  expect(catalogFireProfile(["node:6621423513"])).toMatchObject({
    kind: "shared",
    employment: "mixed",
  });
  expect(catalogFireProfile(["node:99999999999"]).kind).toBe("unknown");
});
it("professional allein und ein Name allein beweisen keine deutsche BF; hauptamtliche FF bleibt FF", () => {
  expect(
    classifyFireProfile({
      amenity: "fire_station",
      name: "Feuerwache",
      "fire_station:type": "professional",
    }).kind,
  ).toBe("unknown");
  expect(
    classifyFireProfile({
      amenity: "fire_station",
      name: "Freiwillige Feuerwehr Teststadt",
    }).kind,
  ).toBe("unknown");
  expect(
    classifyFireProfile({
      amenity: "fire_station",
      name: "Freiwillige Feuerwehr Teststadt",
      "fire_station:type": "voluntary",
      "fire_station:team": "professional",
    }),
  ).toMatchObject({ kind: "ff-paid", employment: "mixed" });
});
it("ungeklärte neue Angebote lehnen Käufe ohne Geld- oder Personaleffekt ab", () => {
  const { s, f } = station("unknown");
  const before = structuredClone(s);
  expect(facilityOffer(s, f).reason).toContain("ungeklärt");
  expect(() => purchaseFacility(s, f.id)).toThrow("ungeklärt");
  expect(s).toEqual(before);
});
it("ein unveränderter Starteretat reicht für belegte FF und TSF-W; BF ist bei gleicher Stellplatzzahl teurer", () => {
  const { s, f } = station("ff");
  s.money = fresh("A", "B", s.time).money;
  s.xp = 0;
  expect(facilityOffer(s, f).reason).toBe("");
  purchaseFacility(s, f.id, fireQuote(f.fireProfile));
  tick(s, s.buildings[0].ready, {}, false, false);
  expect(() =>
    apply(s, { type: "buy", home: s.buildings[0].id, kind: "tsf" }),
  ).not.toThrow();
  expect(s.money).toBeGreaterThanOrEqual(0);
  expect(FIRE_GAME_PROFILES.bf.slots).toBe(FIRE_GAME_PROFILES.ff.slots);
  expect(FIRE_GAME_PROFILES.bf.price).toBeGreaterThan(
    FIRE_GAME_PROFILES.ff.price * 2,
  );
});
it("veraltete Preisbestätigung bucht nichts; wiederholter Kauf und Neustart erzeugen keine zweite Besetzung", () => {
  const { s, f, buy } = station("ff");
  const before = structuredClone(s);
  expect(() => purchaseFacility(s, f.id, "stale-price")).toThrow("Preisstand");
  expect(s).toEqual(before);
  buy();
  const bought = structuredClone(s);
  purchaseFacility(s, f.id, "old-repeat");
  expect(s).toEqual(bought);
  const restored = validate(JSON.parse(JSON.stringify(s)));
  reconcileBuildingStaffing(restored);
  expect(restored.people).toEqual(s.people);
  expect(restored.money).toBe(s.money);
  expect(restored.vehicles).toHaveLength(0);
});
it.each([
  "ff",
  "ff-paid",
  "bf",
  "shared",
  "works",
  "company",
  "airport",
] as const)(
  "%s stellt ausschließlich seine begrenzte Spielbesetzung bereit",
  (kind) => {
    const { s, buy, f } = station(kind),
      b = buy(),
      game = fireGameProfile(f.fireProfile)!;
    expect(s.people).toHaveLength(game.people);
    expect(s.people.filter((p) => p.professional)).toHaveLength(game.paid);
    expect(stationCapacity(b).slots).toBe(game.slots);
    const snapshot = structuredClone(s);
    reconcileBuildingStaffing(s);
    expect(s).toEqual(snapshot);
  },
);
it("BF mit gebundener Schicht kann kein drittes LF besetzen; Kräfte werden nicht doppelt zugewiesen", () => {
  const { s, buy } = station("bf"),
    b = buy();
  for (let i = 0; i < 3; i++) apply(s, { type: "buy", home: b.id, kind: "lf" });
  expect(s.people).toHaveLength(18);
  expect(crewSummary(s, s.vehicles[0]).present).toBe(9);
  expect(crewSummary(s, s.vehicles[1]).present).toBe(9);
  expect(crewSummary(s, s.vehicles[2]).present).toBe(0);
  expect(turnoutEstimate(s, s.vehicles[0])).toBe(25);
  generate(s);
  const m = s.missions[0];
  m.template = "field";
  attachIncident(s, m);
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = "reported-fire";
  alarm(
    s,
    m,
    s.vehicles.slice(0, 2).map((v) => v.id),
    s.player.id,
  );
  expect(() => alarm(s, m, [s.vehicles[2].id], s.player.id)).toThrow();
  expect(new Set(s.people.filter((p) => p.vehicle).map((p) => p.id)).size).toBe(
    18,
  );
});
it("Bestandspersonal wird in der BF erhalten, erweitert aber nicht die endliche aktive Schicht", () => {
  const { s, buy } = station("bf"),
    b = buy();
  s.people.push({
    ...structuredClone(s.people[0]),
    id: "retained-person",
    professional: false,
  });
  b.fireCapacityRetained = { slots: 8, people: 81 };
  reconcileBuildingStaffing(s);
  expect(s.people).toHaveLength(19);
  expect(s.people.filter((p) => p.professional)).toHaveLength(18);
  expect(s.people.filter((p) => personAvailable(s, p))).toHaveLength(1);
});
it("eine belegte FF erhält keinen erfundenen Kern und lässt ihre feste Identität nicht ändern", () => {
  const { s, buy } = station("ff"),
    b = buy();
  apply(s, { type: "buy", home: b.id, kind: "tsf" });
  expect(crewSummary(s, s.vehicles[0]).present).toBe(0);
  expect(turnoutEstimate(s, s.vehicles[0])).toBeGreaterThan(30);
  expect(b.readinessCore).toBeUndefined();
  const before = structuredClone(s);
  expect(() =>
    organizationCommand(
      s,
      { type: "station-upgrade-bf", home: b.id },
      s.player.id,
    ),
  ).toThrow();
  expect(s).toEqual(before);
});

it("anwesende FF-Bereitschaft rückt ohne erneute Privatanreise aus und wird nur einem Fahrzeug zugeordnet", () => {
  const { s, buy } = station("ff"),
    b = buy();
  apply(s, { type: "buy", home: b.id, kind: "tsf" });
  apply(s, { type: "buy", home: b.id, kind: "tsf" });
  const first = s.vehicles[0],
    second = s.vehicles[1],
    minimum = crewRequired(s, first);
  for (const [i, p] of s.people.entries()) {
    p.duty = {
      ...personDuty(s, p),
      standby: i < minimum,
      simulationOverride: { available: false, until: s.time + 600 },
    };
  }
  expect(crewSummary(s, first).present).toBe(minimum);
  expect(turnoutEstimate(s, first)).toBe(FIRE_GAME_PROFILES.ff.turnout);
  expect(planTurnout(s, first, 60)).toBe(FIRE_GAME_PROFILES.ff.turnout);
  expect(first.turnout!.arrivals).toHaveLength(minimum);
  expect(first.turnout!.arrivals.every((a) => a.at === s.time && !a.path)).toBe(
    true,
  );
  first.status = "alarmed";
  expect(crewSummary(s, second).present).toBe(0);
  expect(planTurnout(s, second, 60)).toBe(600);
  expect(second.turnout!.arrivals).toHaveLength(0);
  expect(s.people.filter((p) => p.professional)).toHaveLength(0);
});
