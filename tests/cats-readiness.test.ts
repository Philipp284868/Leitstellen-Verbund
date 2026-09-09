import { describe, expect, it } from "vitest";
import { fresh, validate } from "../src/model";
import { apply, tick, readiness } from "../src/engine";
import { buildReason } from "../src/purchase";
import { nodes } from "../src/world";
import { xpForLevel } from "../src/progression";
import {
  civilProtectionCommand,
  civilProtectionTick,
  migrateCivilProtection,
} from "../src/simulation/civil-protection";
import { crewSummary, planTurnout } from "../src/simulation/staffing";
import { vt } from "../src/catalog";
function fixture() {
  const s = fresh("Test", "KatS", 1000);
  s.seed = 101;
  s.generation = "kats-readiness-fixed";
  s.money = 1e10;
  s.xp = xpForLevel(25);
  apply(s, {
    type: "build",
    kind: "kats",
    pos: nodes.find((p) => !buildReason(s, "kats", p))!,
  });
  tick(s, s.time + 25, {}, false, false);
  const b = s.buildings[0];
  apply(s, { type: "buy", kind: "gwsan", home: b.id });
  apply(s, { type: "buy", kind: "ktwb", home: b.id });
  return s;
}
describe("reale KatS-Bereitschaft", () => {
  it("baut einen tatsächlichen Standort und alarmiert GW-SAN/NKTW ohne Katastrophenalarm", () => {
    const s = fixture();
    expect(s.vehicles.map((v) => v.name)).toEqual([
      "KatS-GW-SAN01",
      "KatS-NKTW01",
    ]);
    expect(vt("gwsan").capacity).toBe(0);
    expect(vt("ktwb").capacity).toBe(2);
    for (const v of s.vehicles) expect(readiness(s, v)).toBe("");
    const v = s.vehicles[0];
    expect(crewSummary(s, v).present).toBe(0);
    expect(planTurnout(s, v, 60)).toBeGreaterThan(30);
    expect(
      v.turnout!.arrivals.every((a) => a.at > s.time && a.path?.length),
    ).toBe(true);
    expect(() => validate(JSON.parse(JSON.stringify(s)))).not.toThrow();
  });
  it("sammelt dieselben realen Kräfte, verkürzt nur erneutes Sammeln und überlebt einen Neustart", () => {
    const s = fixture(),
      b = s.buildings[0];
    const original = s.people.map((p) => p.id),
      money = s.money;
    const ordinary = planTurnout(
      structuredClone(s),
      structuredClone(s.vehicles[0]),
      60,
    );
    civilProtectionCommand(
      s,
      {
        type: "civil-readiness",
        homes: [b.id],
        op: "mobilize",
        reason: "Überörtliche Hilfe",
      },
      s.player.id,
    );
    const c = b.civilProtection!;
    expect(c.staging!.length).toBe(8);
    expect(c.readyAt).toBeGreaterThan(s.time);
    expect(c.staging!.every((a) => a.path?.length)).toBe(true);
    const restored = validate(JSON.parse(JSON.stringify(s)));
    restored.time = c.readyAt;
    civilProtectionTick(restored);
    expect(restored.buildings[0].civilProtection!.state).toBe("ready");
    const v = restored.vehicles[0];
    expect(crewSummary(restored, v).present).toBe(8);
    const delay = planTurnout(restored, v, 60);
    expect(delay).toBe(30);
    expect(delay).toBeLessThan(ordinary);
    expect(restored.people.map((p) => p.id)).toEqual(original);
    expect(restored.money).toBe(money);
    const other = restored.vehicles[1];
    v.status = "alarmed";
    v.depart = restored.time + delay;
    planTurnout(restored, other, 60);
    expect(
      new Set(
        restored.vehicles.flatMap((v) =>
          v.turnout!.arrivals.map((a) => a.person),
        ),
      ).size,
    ).toBe(8);
  });
  it("prüft Leitung, Mindestlaufzeit, Abklingzeit und erhält gebundene Personen beim Beenden", () => {
    const s = fixture(),
      b = s.buildings[0],
      actor = s.player.id;
    const before = structuredClone(s);
    expect(() =>
      civilProtectionCommand(
        s,
        { type: "civil-readiness", homes: [b.id], op: "mobilize" },
        "other",
      ),
    ).toThrow("Leitstellenleitung");
    expect(s).toEqual(before);
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [b.id], op: "mobilize" },
      actor,
    );
    const c = b.civilProtection!;
    expect(() =>
      civilProtectionCommand(
        s,
        { type: "civil-readiness", homes: [b.id], op: "stand-down" },
        actor,
      ),
    ).toThrow("Mindestlaufzeit");
    s.time = Math.max(c.minimumUntil!, c.readyAt);
    civilProtectionTick(s);
    const v = s.vehicles[0];
    planTurnout(s, v, 60);
    v.status = "alarmed";
    v.depart = s.time + 30;
    const crew = structuredClone(s.people.filter((p) => p.vehicle === v.id));
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [b.id], op: "stand-down" },
      actor,
    );
    expect(s.people.filter((p) => p.vehicle === v.id)).toEqual(crew);
    expect(v.status).toBe("alarmed");
    expect(() =>
      civilProtectionCommand(
        s,
        { type: "civil-readiness", homes: [b.id], op: "mobilize" },
        actor,
      ),
    ).toThrow("Abklingzeit");
    s.time += 1000;
    civilProtectionTick(s);
    expect(s.people.filter((p) => p.vehicle === v.id)).toEqual(crew);
    expect(
      c.staging!.filter((a) => crew.some((p) => p.id === a.person)).length,
    ).toBe(6);
  });
  it("migriert Timerbereitschaft idempotent ohne falsche Anwesenheit oder Ressourcenänderung", () => {
    const s = fixture(),
      b = s.buildings[0];
    b.civilProtection = {
      enabled: true,
      preparation: 60,
      state: "ready",
      readyAt: s.time - 1,
      history: [],
    };
    const ids = s.people.map((p) => p.id),
      money = s.money,
      vehicles = structuredClone(s.vehicles);
    expect(migrateCivilProtection(s)).toBe(1);
    expect(b.civilProtection.state).toBe("mobilizing");
    expect(crewSummary(s, s.vehicles[0]).present).toBe(0);
    const once = structuredClone(s);
    expect(migrateCivilProtection(s)).toBe(0);
    expect(s).toEqual(once);
    expect(s.people.map((p) => p.id)).toEqual(ids);
    expect(s.money).toBe(money);
    expect(s.vehicles).toEqual(vehicles);
  });
});
