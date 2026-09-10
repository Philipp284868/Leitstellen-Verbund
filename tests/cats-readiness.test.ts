import { fixturePurchase } from "./fixtures/germany/facilities";
import { describe, expect, it } from "vitest";
import { apply, readiness, tick } from "../src/engine";
import { fresh, validate } from "../src/model";
import { sites as nodes } from "./fixtures/germany/locations";

import { vt } from "../src/catalog";
import { xpForLevel } from "../src/progression";
import { attachIncident, callAction } from "../src/simulation/calls";
import {
  civilProtectionCommand,
  civilProtectionTick,
  migrateCivilProtection,
  readinessRecommendation,
} from "../src/simulation/civil-protection";
import { alarm } from "../src/simulation/dispatch";
import { attachDynamics } from "../src/simulation/dynamics";
import { simId } from "../src/simulation/events";
import { radioAction } from "../src/simulation/incidents";
import { crewSummary, planTurnout } from "../src/simulation/staffing";
import { phaseFixture } from "./dispatch-fixture";
function fixture() {
  const s = fresh("Test", "KatS", 1000);
  s.seed = 101;
  s.generation = "kats-readiness-fixed";
  s.money = 1e10;
  s.xp = xpForLevel(25);
  apply(s, fixturePurchase("kats", nodes[0]));
  tick(s, s.time + 25, {}, false, false);
  const b = s.buildings[0];
  apply(s, { type: "buy", kind: "gwsan", home: b.id });
  apply(s, { type: "buy", kind: "ktwb", home: b.id });
  return s;
}
describe("reale KatS-Bereitschaft", () => {
  it("empfiehlt anhand kombinierter Last und hält verschiedene Ein-/Ausschaltschwellen ein", () => {
    const s = phaseFixture("load", "bin"),
      m = s.missions[0];
    m.control!.calls[0].created = s.time - 180;
    m.control!.briefed = true;
    m.control!.reportedTemplate = "bin";
    m.control!.priority = "NOTFALL";
    s.vehicles.forEach((v) => (v.status = "scene"));
    expect(readinessRecommendation(s).recommended).toBe(true);
    s.vehicles.forEach((v) => (v.status = "ready"));
    m.control!.priority = "NORMAL";
    expect(readinessRecommendation(s).recommended).toBe(false);
    s.buildings[0].civilProtection = {
      enabled: true,
      preparation: 60,
      state: "mobilizing",
      readyAt: s.time + 60,
      history: [],
    };
    expect(readinessRecommendation(s).recommended).toBe(true);
    m.control!.calls[0].state = "ended";
    expect(readinessRecommendation(s).recommended).toBe(false);
  });
  it("behandelt mit GW-SAN und transportiert mit NKTW bis zur echten Klinikübergabe und Nachbereitung", () => {
    const s = fixture(),
      home = s.buildings[0];
    const m = {
      id: simId(s),
      template: "sick",
      pos: { ...home.pos },
      progress: 0,
      phase: "offered" as const,
      created: s.time,
      completed: 0,
      shared: false,
      round: simId(s),
      contributors: [],
      transports: [],
    };
    s.missions.push(m);
    attachIncident(s, m);
    attachDynamics(s, m);
    const incident = s.missions[0],
      call = incident.control!.calls[0];
    call.stress = 30;
    callAction(s, incident, call.id, "accept", s.player.id);
    callAction(s, incident, call.id, "ask", s.player.id, "address");
    tick(s, s.time + 5, {}, false, false);
    callAction(s, incident, call.id, "ask", s.player.id, "report");
    callAction(s, incident, call.id, "end", s.player.id);
    alarm(
      s,
      incident,
      s.vehicles.map((v) => v.id),
      s.player.id,
    );
    expect(s.vehicles.every((v) => v.depart > s.time + 30)).toBe(true);
    expect(
      new Set(s.people.filter((p) => p.vehicle).map((p) => p.id)).size,
    ).toBe(8);
    let sawTransport = false,
      sawPost = false;
    for (let i = 0; i < 1440; i++) {
      for (const current of s.missions)
        for (const r of current.control?.radio.filter(
          (r) => r.state === "open",
        ) ?? [])
          radioAction(
            s,
            current,
            r.id,
            r.reason === "arrival" ? "report" : "request",
            s.player.id,
          );
      tick(s, s.time + 5, {}, false, false);
      const gw = s.vehicles.find((v) => v.type === "gwsan")!,
        nktw = s.vehicles.find((v) => v.type === "ktwb")!;
      expect(gw.patients).toBe(0);
      expect(gw.status).not.toBe("transport");
      if (nktw.status === "transport") {
        sawTransport = true;
        expect(nktw.patients).toBeGreaterThan(0);
        expect(nktw.destination).toBeTruthy();
      }
      if (nktw.postIncident) sawPost = true;
      if (
        s.archive.length &&
        s.vehicles.every((v) => v.status === "ready" && !v.postIncident)
      )
        break;
    }
    expect(sawTransport).toBe(true);
    expect(sawPost).toBe(true);
    expect(
      s.archive[0].dynamics!.patients.every((p) => p.transport === "delivered"),
    ).toBe(true);
    expect(
      s.vehicles.every((v) => v.status === "ready" && v.patients === 0),
    ).toBe(true);
    expect(() => validate(s)).not.toThrow();
  });
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
