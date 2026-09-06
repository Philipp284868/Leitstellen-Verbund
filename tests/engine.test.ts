import { describe, it, expect } from "vitest";
import { fresh, validate, level, achievementProgress } from "../src/model";
import {
  apply,
  tick,
  money,
  readiness,
  capacity,
  missing,
  generate,
} from "../src/engine";
import { buildings, vehicles, missions, mt, BALANCE } from "../src/catalog";
import { nodes, route, length, along, docks } from "../src/world";
import { exportText, parseImport } from "../src/storage";
import { commandSchema } from "../server/actions";
function setup() {
  const s = fresh("Anna", "Leitstelle Nord", 1000);
  apply(s, { type: "build", kind: "fire", pos: nodes[0] });
  tick(s, 1030);
  apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
  apply(s, { type: "hire", home: s.buildings[0].id, count: 6 });
  apply(s, { type: "assign", vehicle: s.vehicles[0].id });
  return s;
}
describe("Kataloge und Erreichbarkeit", () => {
  it("enthält 8 Gebäude, 20 Fahrzeuge und 40 unterschiedliche Einsatzanforderungen", () => {
    expect(buildings).toHaveLength(8);
    expect(vehicles).toHaveLength(20);
    expect(missions).toHaveLength(40);
    expect(
      new Set(missions.map((m) => JSON.stringify(m.requirements))).size,
    ).toBe(40);
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
    apply(s, { type: "hire", home: s.buildings[0].id, count: 6 });
    expect(s.money).toBe(151800);
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
    s.people.pop();
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
    s.xp = 150;
    apply(s, { type: "build", kind: "school", pos: nodes[3] });
    tick(s, s.time + 30);
    apply(s, { type: "train", person: s.people[0].id, skill: "Drehleiter" });
    expect(readiness(s, s.vehicles[0])).not.toBe("");
    tick(s, s.time + 200);
    expect(s.people[0].skills).toContain("Drehleiter");
    expect(readiness(s, s.vehicles[0])).toBe("");
    expect(level(s)).toBe(2);
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
    s.xp = 300;
    money(s, 200000, "Testkapital");
    apply(s, { type: "build", kind: "ems", pos: nodes[3] });
    apply(s, { type: "build", kind: "hospital", pos: nodes[6] });
    tick(s, s.time + 30);
    const home = s.buildings.find((b) => b.type === "ems")!;
    apply(s, { type: "buy", kind: "rtw", home: home.id });
    apply(s, { type: "hire", home: home.id, count: 2 });
    const v = s.vehicles.find((v) => v.type === "rtw")!;
    apply(s, { type: "assign", vehicle: v.id });
    s.missions = [];
    generate(s);
    const m = s.missions[0];
    m.template = "sick";
    m.pos = nodes[6];
    apply(s, { type: "dispatch", mission: m.id, vehicles: [v.id] });
    const before = s.money;
    tick(s, s.time + 120);
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
  it("berechnet Straßenwege mit Zwischenknoten statt Luftlinie", () => {
    const path = route(nodes[0], nodes[116]);
    expect(path.length).toBeGreaterThan(15);
    expect(length(path)).toBeGreaterThan(length([nodes[0], nodes[116]]));
    expect(along(path, 0)).toEqual(nodes[0]);
    expect(along(path, 1)).toEqual(nodes[116]);
  });
  it("trennt Wasser- und Flugwege", () => {
    expect(() => route(nodes[0], nodes[1], "water")).toThrow();
    expect(route(docks[0], docks[1], "water")).toHaveLength(4);
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
