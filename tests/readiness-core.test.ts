import { describe, expect, it } from "vitest";
import { fresh, validate } from "../src/model";
import { apply, tick, generate } from "../src/engine";
import { nodes } from "../src/world";
import { BALANCE } from "../src/catalog";
import { xpForLevel } from "../src/progression";
import { reconcileReadinessCore } from "../src/simulation/readiness-core";
import { attachIncident } from "../src/simulation/calls";
import { alarm } from "../src/simulation/dispatch";
import { crewSummary, turnoutEstimate } from "../src/simulation/staffing";

function station(seed = 101) {
  const s = fresh("Test", "Bereitschaft", 1000);
  s.generation = "readiness-core-fixed-generation";
  s.seed = seed;
  s.money = 1e9;
  apply(s, { type: "build", kind: "fire", pos: nodes[0] });
  return s;
}

describe("hauptamtlicher FFW-Bereitschaftskern", () => {
  it("bestimmt vier bis sechs Personen erst bei Inbetriebnahme und würfelt nach Reload nicht neu", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = station(seed);
      expect(s.buildings[0].readinessCore).toBeUndefined();
      expect(s.people).toHaveLength(0);
      tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
      const b = s.buildings[0];
      const initial = structuredClone(b.readinessCore!);
      counts.add(initial.count);
      expect(s.people.filter((p) => p.professional)).toHaveLength(
        initial.count,
      );
      const restored = validate(JSON.parse(JSON.stringify(s)));
      restored.seed = 90000;
      tick(restored, restored.time + 60, {}, false, false);
      expect(restored.buildings[0].readinessCore).toEqual(initial);
      expect(restored.people.map((p) => p.id)).toEqual(
        s.people.map((p) => p.id),
      );
      expect(restored.people.filter((p) => p.professional)).toHaveLength(
        initial.count,
      );
    }
    expect([...counts].sort()).toEqual([4, 5, 6]);
  });

  it("besetzt ein kleines Fahrzeug sofort, wartet beim zweiten echte Ergänzung ab und bindet niemanden doppelt", () => {
    const s = station();
    tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
    const b = s.buildings[0];
    for (let i = 0; i < 2; i++)
      apply(s, { type: "buy", home: b.id, kind: "tsf" });
    expect(crewSummary(s, s.vehicles[0]).present).toBeGreaterThanOrEqual(4);
    expect(turnoutEstimate(s, s.vehicles[0])).toBe(30);
    generate(s);
    const m = s.missions[0];
    m.template = "bin";
    m.pos = nodes[2];
    attachIncident(s, m);
    m.control!.locationKnown = true;
    m.control!.reportedTemplate = "reported-fire";
    alarm(
      s,
      m,
      s.vehicles.map((v) => v.id),
      s.player.id,
    );
    const [first, second] = s.vehicles;
    expect(first.status).toBe("alarmed");
    expect(first.depart - s.time).toBe(30);
    expect(first.turnout!.arrivals).toHaveLength(4);
    expect(first.turnout!.arrivals.every((a) => a.at === s.time)).toBe(true);
    expect(
      second.turnout!.arrivals.some((a) => a.at > s.time && !!a.path?.length),
    ).toBe(true);
    const bound = s.vehicles.flatMap((v) =>
      v.turnout!.arrivals.map((a) => a.person),
    );
    expect(bound).toHaveLength(8);
    expect(new Set(bound).size).toBe(8);
    tick(s, s.time + 29, {}, false, false);
    expect(first.status).toBe("alarmed");
    tick(s, s.time + 1, {}, false, false);
    expect(first.status).toBe("travel");
    expect(s.desk.fleet[first.id].code).toBe(3);
    expect(second.status).toBe("alarmed");
    expect(() => validate(JSON.parse(JSON.stringify(s)))).not.toThrow();
  });

  it("erhält stärkere Altbesetzung, Identitäten und gebundene Zuweisungen bei wiederholter Migration", () => {
    const s = station();
    s.xp = xpForLevel(2);
    tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
    const b = s.buildings[0];
    apply(s, { type: "buy", home: b.id, kind: "lf" });
    delete b.readinessCore;
    s.people.forEach((p) => {
      p.professional = true;
      p.vehicle = s.vehicles[0].id;
    });
    const people = structuredClone(s.people);
    const fleet = structuredClone(s.vehicles);
    const money = s.money;
    reconcileReadinessCore(s, b);
    const core = structuredClone(b.readinessCore);
    reconcileReadinessCore(s, b);
    expect(b.readinessCore).toEqual(core);
    expect(s.people).toEqual(people);
    expect(s.vehicles).toEqual(fleet);
    expect(s.money).toBe(money);
    expect(s.people.filter((p) => p.professional).length).toBeGreaterThan(6);
  });
});
