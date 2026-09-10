import { describe, expect, it } from "vitest";
import { commandSchema } from "../server/actions";
import { BALANCE, buildings, missions, mt, vehicles } from "../src/catalog";
import {
  apply,
  capacity,
  generate,
  missing,
  money,
  readiness,
  tick,
} from "../src/engine";
import { achievementProgress, fresh, level, validate } from "../src/model";
import { euro } from "../src/money";
import { xpForLevel } from "../src/progression";
import { exportText, parseImport } from "../src/storage";
import { along, length, roadSectionBetween, route } from "../src/world";
import { sites as nodes } from "./fixtures/germany/locations";
function setup() {
  const s = fresh("Anna", "Leitstelle Nord", 1000);
  apply(s, { type: "build", kind: "fire", pos: nodes[0] });
  tick(s, 1030);
  apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });

  return s;
}
describe("Kataloge und Erreichbarkeit", () => {
  it("enthält den erweiterten Fahrzeug- und Einsatzkatalog mit unterschiedlichen Anforderungen", () => {
    expect(buildings).toHaveLength(9);
    expect(vehicles).toHaveLength(50);
    expect(missions.length).toBeGreaterThan(600);
    expect(
      new Set(missions.map((m) => JSON.stringify(m.requirements))).size,
    ).toBeGreaterThan(150);
  });
  it("referenziert gültige Wachen und erfüllbare Fähigkeiten ohne Stufenzirkel", () => {
    const all: Record<string, number> = {};
    for (const v of vehicles) {
      expect(buildings.some((b) => b.id === v.home)).toBe(true);
      expect(v.level).toBeGreaterThanOrEqual(
        buildings.find((b) => b.id === v.home)!.level,
      );
      for (const [k, n] of Object.entries(v.skills))
        all[k] = (all[k] || 0) + n * 10;
    }
    for (const m of missions)
      for (const [k, n] of Object.entries(m.requirements))
        expect(all[k]).toBeGreaterThanOrEqual(n);
    expect(missions.some((m) => m.level === 1)).toBe(true);
  });
});
describe("Wirtschaft, Besatzung und Fahrzeuge", () => {
  it("finanziert Erstwache, zwei Basisfahrzeuge und Besatzung mit Reserve", () => {
    const s = setup();
    apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });

    expect(s.money).toBe(euro(390000));
    expect(s.journal.reduce((n, j) => n + j.amount, BALANCE.start)).toBe(
      s.money,
    );
  });
  it("verhindert negative und nicht endliche Beträge sowie doppelte Belege", () => {
    const s = setup(),
      before = s.money;
    expect(() => money(s, -1e9, "Kauf")).toThrow();
    expect(() => money(s, NaN, "Kauf")).toThrow();
    expect(() => money(s, Infinity, "Kauf")).toThrow();
    money(s, 100, "Belohnung", "receipt");
    money(s, 100, "Belohnung", "receipt");
    expect(s.money).toBe(before + 100);
  });
  it("prüft Personal, Ausbildung, Stellplätze und Stufen", () => {
    const s = setup();
    expect(readiness(s, s.vehicles[0])).toBe("");
    s.people.splice(3); // TSF-W may turn out with four; three is insufficient.
    expect(readiness(s, s.vehicles[0])).toContain("1 geeignete");
    expect(() =>
      apply(s, { type: "buy", kind: "rtw", home: s.buildings[0].id }),
    ).toThrow();
    expect(() =>
      apply(s, { type: "build", kind: "heli", pos: nodes[1] }),
    ).toThrow();
  });
  it("alarmiert niemals dasselbe Fahrzeug zweimal und ruft kontrolliert zurück", () => {
    const s = setup();
    generate(s);
    const a = {
      type: "dispatch" as const,
      mission: s.missions[0].id,
      vehicles: [s.vehicles[0].id, s.vehicles[0].id],
    };
    apply(s, a);
    expect(s.vehicles[0].status).toBe("travel");
    expect(() => apply(s, a)).toThrow();
    apply(s, { type: "recall", id: s.vehicles[0].id });
    expect(s.vehicles[0].mission).toBeNull();
    tick(s, s.time + 3000);
    expect(s.vehicles[0].status).toBe("ready");
  });
  it("verkauft keine belegte Wache und erhält Personal bei Fahrzeugverkauf", () => {
    const s = setup();
    expect(() => apply(s, { type: "sell", id: s.buildings[0].id })).toThrow();
    apply(s, { type: "sell", id: s.vehicles[0].id });
    expect(s.people).toHaveLength(6);
    expect(s.people.every((p) => p.vehicle === null)).toBe(true);
  });
  it("bearbeitet einen Solo-Einsatz, bucht genau einmal und kehrt zurück", () => {
    const s = setup();
    s.economy!.fundingNextAt = 1e12; // Isolate mission rewards from recurring funding.
    generate(s);
    const m = s.missions[0];
    const before = s.money;
    apply(s, { type: "dispatch", mission: m.id, vehicles: [s.vehicles[0].id] });
    tick(s, s.time + 12000);
    expect(s.archive.some((x) => x.id === m.id)).toBe(true);
    expect(s.money).toBe(before + mt(m.template).reward);
    tick(s, s.time + 12000);
    expect(s.money).toBe(before + mt(m.template).reward);
    expect(s.vehicles[0].status).toBe("ready");
    expect(achievementProgress(s, 0)).toBe(1);
  });
  it("Ausbildung blockiert Besatzung und schließt zeitbasiert ab", () => {
    const s = setup();
    s.xp = xpForLevel(5);
    apply(s, { type: "build", kind: "school", pos: nodes[3] });
    tick(s, s.time + 30);
    s.people.splice(4); // Training removes one member from the minimum available crew.
    apply(s, { type: "train", person: s.people[0].id, skill: "Drehleiter" });
    expect(readiness(s, s.vehicles[0])).not.toBe("");
    tick(s, s.time + 200);
    expect(s.people[0].skills).toContain("Drehleiter");
    expect(readiness(s, s.vehicles[0])).toBe("");
    expect(level(s)).toBe(5);
  });
  it("falsche Fahrzeuge erfüllen keine Brandanforderung", () => {
    const s = setup();
    generate(s);
    s.vehicles[0].type = "fustw";
    s.vehicles[0].mission = s.missions[0].id;
    s.vehicles[0].status = "scene";
    expect(
      missing(s.missions[0], capacity(s, s.missions[0].id)).length,
    ).toBeGreaterThan(0);
  });
  it("behandelt Patienten, fährt zum eigenen Krankenhaus und gibt Betten frei", () => {
    const s = setup();
    s.xp = xpForLevel(12);
    money(s, euro(2500000), "Testkapital für Klinik und Rettungsdienst");
    apply(s, { type: "build", kind: "ems", pos: nodes[3] });
    apply(s, { type: "build", kind: "hospital", pos: nodes[6] });
    tick(s, s.time + 30);
    const home = s.buildings.find((b) => b.type === "ems")!;
    apply(s, { type: "buy", kind: "rtw", home: home.id });

    const v = s.vehicles.find((v) => v.type === "rtw")!;

    s.missions = [];
    generate(s);
    const m = s.missions[0];
    m.template = "sick";
    m.paymentCents = mt("sick").reward;
    m.pos = nodes[6];
    apply(s, { type: "dispatch", mission: m.id, vehicles: [v.id] });
    const before = s.money;
    for (let i = 0; i < 400 && !s.beds.length; i++)
      tick(s, s.time + 5, {}, false, false);
    expect(s.archive.some((x) => x.id === m.id)).toBe(true);
    expect(s.beds[0]?.home).toBe(
      s.buildings.find((b) => b.type === "hospital")!.id,
    );
    expect(s.money).toBe(before + mt("sick").reward);
    tick(s, s.time + 300);
    expect(s.beds).toHaveLength(0);
    expect(s.treated).toBe(1);
    expect(v.status).toBe("ready");
  });
});
describe("Wege und Zeit", () => {
  it("nutzt die vom Provider gelieferten Zwischenpunkte und metrischen Abschnitte", () => {
    const path = route(nodes[0], nodes[116]);
    expect(path.length).toBe(3);
    const sections = path
      .slice(1)
      .map((p, i) => roadSectionBetween(path[i], p));
    expect(sections.reduce((sum, s) => sum + s.meters, 0)).toBeCloseTo(
      length(path) * 12,
      6,
    );
    expect(along(path, 0)).toEqual(nodes[0]);
    expect(along(path, 1)).toEqual(nodes[116]);
  });
  it("trennt Luftwege vom Straßenprofil und lehnt unbelegtes Wasserrouting ab", () => {
    expect(() => route(nodes[0], nodes[1], "water")).toThrow();
    expect(route(nodes[0], nodes[116], "air")).toHaveLength(2);
  });
  it("begrenzt Offlinezeit und erzeugt offline keine Einsätze", () => {
    const s = setup();
    const time = s.time;
    tick(s, time + 1e8, {}, true);
    expect(s.time - time).toBeCloseTo(14400);
    expect(s.missions).toHaveLength(0);
    tick(s, 0);
    expect(s.time).toBeGreaterThanOrEqual(time);
  });
  it("schließt gemeinsame Einsätze offline nicht ab", () => {
    const s = setup();
    generate(s);
    const m = s.missions[0];
    m.shared = true;
    s.vehicles[0].mission = m.id;
    s.vehicles[0].status = "scene";
    tick(s, s.time + 5000, {}, true);
    expect(m.progress).toBe(0);
  });
});
describe("Import und Protokoll", () => {
  it("exportiert und importiert einen vollständigen Spielstand", () => {
    const s = setup();
    expect(parseImport(exportText(s))).toEqual(s);
  });
  it("verwirft defekte, veraltete, zu große und inkonsistente Spielstände", () => {
    expect(() => parseImport("{")).toThrow();
    expect(() =>
      parseImport(
        JSON.stringify({ format: "leitstellen-verbund", version: 0 }),
      ),
    ).toThrow();
    expect(() => parseImport("x".repeat(8 * 1024 * 1024 + 1))).toThrow();
    const s = setup();
    s.vehicles[0].owner = "fremd";
    expect(() => validate(s)).toThrow();
    s.money = NaN;
    expect(() => validate(s)).toThrow();
  });
  it("weist fremde Kontostände und alte P2P-Pakete zurück", () => {
    expect(
      commandSchema.safeParse({
        id: crypto.randomUUID(),
        action: { type: "relief" },
      }).success,
    ).toBe(true);
    expect(
      commandSchema.safeParse({
        id: crypto.randomUUID(),
        action: { type: "relief", money: 999999 },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        protocol: 1,
        payload: { type: "chat", text: "Hallo" },
      }).success,
    ).toBe(false);
  });
});
