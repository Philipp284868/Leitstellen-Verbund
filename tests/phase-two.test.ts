import { vehiclePosition } from "../src/vehicle-position";
import { it, expect } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { phaseFixture } from "./phase-fixture";
import { emsProfile } from "./e2e/fixtures";
import {
  attachDynamics,
  dynamicsTick,
  followupsTick,
} from "../src/simulation/dynamics";
import { attachIncident } from "../src/simulation/calls";
import { requirements } from "../src/simulation/hazards";
import { approach, tripLabel } from "../src/travel";
import { environmentAt } from "../src/simulation/weather";
import { routePlan, trafficTick } from "../src/simulation/traffic";
import {
  breakVehicle,
  repairVehicle,
  faultsTick,
} from "../src/simulation/faults";
import { patientTick, patientsReady } from "../src/simulation/patients";
import { deskCommand } from "../src/simulation/commands";
import { publicSave, radioAction } from "../src/simulation/incidents";
import { alarm } from "../src/simulation/dispatch";
import { tick, capacity, readiness } from "../src/engine";
import { validate } from "../src/model";
import { Database } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import { nodes, route, nearest, distance } from "../src/world";
function dynamic(template = "field") {
  const s = phaseFixture("owner", template),
    m = s.missions[0];
  attachDynamics(s, m);
  m.control!.briefed = true;
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = m.template;
  s.environment = {
    ...environmentAt(s.time),
    kind: "cloud",
    wind: 0,
    rain: 0,
    visibility: 15000,
    density: 0,
    roads: [],
  };
  return s;
}
it("bekämpft einen dynamischen Brand vollständig und bewahrt Verlauf, Transportfreiheit und Belohnung", () => {
  const s = dynamic(),
    m = s.missions[0];
  alarm(
    s,
    m,
    s.vehicles.map((v) => v.id),
    "owner",
    "NORMAL",
    "station",
  );
  for (let n = 0; n < 180 && s.missions.includes(m); n++)
    tick(s, s.time + 5, {}, false, false);
  expect(s.archive[0].id).toBe(m.id);
  expect(m.dynamics!.hazards.every((h) => h.resolved)).toBe(true);
  expect(m.dynamics!.fire!.suppression).toBe(100);
  expect(m.dynamics!.state).toBe("resolved");
  const money = s.money;
  tick(s, s.time + 60, {}, false, false);
  expect(s.money).toBe(money);
  expect(validate(s)).toBeTruthy();
});
it("eskaliert unversorgte Gefahren begrenzt, löst Brandübersprung aus und stabilisiert mit Verstärkung", () => {
  const s = dynamic("flat"),
    m = s.missions[0],
    d = m.dynamics!;
  d.random = 1;
  d.hazards.forEach((h) => {
    h.value = 85;
    h.growth = 0;
  });
  d.fire!.intensity = 85;
  d.nextEvent = s.time;
  for (let i = 0; i < 30; i++) {
    s.time += 5;
    dynamicsTick(s, m);
  }
  expect(d.level).toBeGreaterThan(1);
  expect(requirements(m).fire).toBeGreaterThan(3);
  expect(d.events.length).toBeLessThanOrEqual(6);
  // Make deterministic threshold-crossing draws over different seeds, not a random flaky test.
  const spread = Array.from({ length: 40 }, (_, seed) => {
    const x = dynamic("flat"),
      caseM = x.missions[0];
    caseM.dynamics!.random = seed;
    caseM.dynamics!.hazards.forEach((h) => (h.value = 85));
    caseM.dynamics!.nextEvent = x.time;
    x.time += 5;
    dynamicsTick(x, caseM);
    return caseM.dynamics!.events.some((e) => e.startsWith("spread-"));
  });
  expect(spread.some(Boolean)).toBe(true);
  for (let n = 0; n < 60; n++) {
    s.time += 5;
    dynamicsTick(s, m, {
      fire: 12,
      water: 12,
      air: 4,
      rescue: 4,
      medical: 4,
      doctor: 2,
      hazmat: 4,
    });
  }
  expect(d.hazards.every((h) => h.resolved)).toBe(true);
  expect(d.state).toBe("aftermath");
});
it("Wetter beeinflusst Fahrzeiten, Nachtruhe und Berufsverkehr; Wetter ist zeitlich reproduzierbar", () => {
  expect(environmentAt(1788768000)).toEqual(environmentAt(1788768000));
  const s = dynamic(),
    v = s.vehicles[0],
    target = nodes[20];
  const normal = routePlan(s, v, v.path[0], target, "normal").seconds;
  const emergency = routePlan(s, v, v.path[0], target, "emergency").seconds;
  expect(normal).toBeCloseTo(emergency); // Limits apply to both modes without arbitrary urgency multipliers.
  s.environment!.rain = 80;
  s.environment!.kind = "ice";
  s.environment!.density = 1.7;
  expect(
    routePlan(s, v, v.path[0], target, "emergency").seconds,
  ).toBeGreaterThan(normal);
  expect(environmentAt(8 * 3600).density).toBeGreaterThan(
    environmentAt(2 * 3600).density,
  );
});
it("aufgehobene Eskalationsanforderungen blockieren den tatsächlichen Abschluss nicht", () => {
  const s = dynamic(),
    m = s.missions[0],
    d = m.dynamics!;
  d.hazards.forEach((h) => {
    h.value = 90;
    h.growth = 0;
  });
  d.nextEvent = s.time;
  tick(s, s.time + 200, {}, false, false);
  expect(d.level).toBe(4);
  expect(requirements(m).fire).toBeGreaterThan(3);
  alarm(
    s,
    m,
    s.vehicles.map((v) => v.id),
    "owner",
    "DRINGEND",
    "station",
  );
  for (let n = 0; n < 180 && s.missions.includes(m); n++)
    tick(s, s.time + 5, {}, false, false);
  expect(s.archive.some((x) => x.id === m.id)).toBe(true);
  expect(d.extra).toEqual({});
  expect(d.level).toBe(1);
});
it("umfährt gesperrte Kanten oder wartet tatsächlich; Verkehrsmeldung teleportiert kein Fahrzeug", () => {
  const s = dynamic(),
    v = s.vehicles[0],
    target = nodes[80];
  const path = route(v.path[0], target),
    ids = path.map(nearest);
  const i = ids.findIndex((x, i) => i > 1 && x !== ids[i - 1]);
  const edge: [number, number] = [ids[i - 1], ids[i]];
  s.environment!.roads = [
    {
      id: "blocked-test",
      kind: "closure",
      edge,
      start: s.time,
      until: s.time + 300,
      delay: 0,
      blocked: true,
    },
  ];
  const plan = routePlan(s, v, v.path[0], target);
  if (plan.blockedUntil) {
    expect(plan.path).toEqual([v.path[0]]);
    expect(approach(s, v, target)).toContain("früheste Freigabe");
    expect(
      tripLabel(
        {
          ...v,
          journey: {
            mode: "priority",
            planned: path,
            plannedSeconds: 100,
            delay: 300,
            distanceDone: 0,
            events: [],
            nextCheck: s.time + 60,
            serial: 0,
            target,
            blockedUntil: plan.blockedUntil,
            reason: "Sperrung",
          },
        },
        s.time,
      ),
    ).toContain("Freigabe");
  } else {
    const p = plan.path.map(nearest);
    expect(
      p.some(
        (x, i) =>
          i > 0 &&
          ((x === edge[0] && p[i - 1] === edge[1]) ||
            (x === edge[1] && p[i - 1] === edge[0])),
      ),
    ).toBe(false);
  }
  s.environment!.roads = [];
  const m = s.missions[0];
  m.pos = target;
  alarm(s, m, [v.id], "owner", "NORMAL", "station");
  s.time = v.depart + 0.1;
  v.status = "travel";
  v.journey!.nextCheck = s.time;
  const current = vehiclePosition(v, s.time);
  s.environment!.roads = [
    {
      id: "jam-test",
      kind: "jam",
      edge,
      start: s.time,
      until: s.time + 300,
      delay: 90,
      blocked: false,
    },
  ];
  trafficTick(s, v);
  expect(v.journey!.events).toContain("jam-test");
  expect(distance(v.path[0], current)).toBeLessThan(0.001);
  expect(v.journey!.delay).toBeGreaterThanOrEqual(90);
});
it("Defekt bindet Fahrzeug, verhindert Fähigkeiten und Ankunft, Reparatur ist wiederholbar und setzt Fahrt fort", () => {
  const s = dynamic(),
    m = s.missions[0],
    v = s.vehicles[0];
  alarm(s, m, [v.id], "owner", "NORMAL", "station");
  s.time = v.depart + 1;
  v.status = "travel";
  const assignment = v.assignment;
  breakVehicle(s, v, "engine");
  expect(readiness(s, v)).toContain("Defekt".toLowerCase());
  expect(s.desk.fleet[v.id].code).toBe(6);
  expect(capacity(s, m.id).fire || 0).toBe(0);
  const pos = { ...v.path[0] };
  tick(s, s.time + 60, {}, false, false);
  expect(v.path).toEqual([pos]);
  expect(v.assignment).toBe(assignment);
  expect(v.status).toBe("travel");
  radioAction(
    s,
    m,
    m.control!.radio.find((r) => r.details.includes("ausgefallen"))!.id,
    "close",
    "owner",
  );
  repairVehicle(s, v, "owner");
  const at = v.fault!.repairAt;
  repairVehicle(s, v, "owner");
  expect(v.fault!.repairAt).toBe(at);
  s.time = at;
  faultsTick(s, v);
  expect(v.fault!.state).toBe("repaired");
  expect(v.path.length).toBeGreaterThan(1);
  expect(v.assignment).toBe(assignment);
  expect(
    m.control!.events.filter((e) => e.type === "REPAIR_ORDERED"),
  ).toHaveLength(1);
  breakVehicle(s, v, "engine");
  expect(
    m.control!.radio.filter((r) => r.details.includes("ausgefallen")),
  ).toHaveLength(2);
  expect(
    m.control!.radio.filter(
      (r) => r.details.includes("ausgefallen") && r.state === "open",
    ),
  ).toHaveLength(1);
});
it("einzelne Patienten verschlechtern sich, benötigen Notarzt, werden versorgt und transportiert", () => {
  const s = emsProfile("Patient"),
    m = s.missions[0];
  attachIncident(s, m);
  attachDynamics(s, m);
  m.control!.briefed = true;
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = m.template;
  const p = m.dynamics!.patients[0];
  p.health = 34;
  patientTick(s, m, {}, 5);
  expect(p.condition).toBe("critical");
  expect(requirements(m).doctor).toBe(1);
  const start = p.health;
  patientTick(s, m, { medical: 2 }, 5);
  expect(p.health - start).toBeLessThan(1);
  patientTick(s, m, { medical: 2, doctor: 1 }, 100);
  expect(p.health).toBeGreaterThan(55);
  expect(patientsReady(m)).toBe(true);
  const rtw = s.vehicles.find((v) => v.type === "rtw")!;
  alarm(s, m, [rtw.id], s.player.id, "DRINGEND", "station");
  for (let n = 0; n < 1500 && s.missions.includes(m); n++) {
    // A random vehicle fault requires a real repair, also in a patient scenario.
    if (rtw.fault?.state === "awaiting") repairVehicle(s, rtw, s.player.id);
    tick(s, s.time + 5, {}, false, false);
  }
  expect(s.archive.some((x) => x.id === m.id)).toBe(true);
  expect(p.transport).toBe("delivered");
  expect(m.transports).toHaveLength(1);
  expect(validate(s)).toBeTruthy();
});
it("Reanimation kann reproduzierbar ROSC oder Tod ergeben; fehlende Kräfte werden nicht simuliert", () => {
  const s = emsProfile("CPR"),
    m = s.missions[0];
  attachIncident(s, m);
  attachDynamics(s, m);
  m.control!.briefed = true;
  const base = structuredClone(s);
  function run(care: boolean) {
    const s = structuredClone(base),
      m = s.missions[0],
      p = m.dynamics!.patients[0];
    p.health = 8;
    p.care = "cpr";
    m.dynamics!.random = 124;
    for (let i = 0; i < 30; i++) {
      s.time += 5;
      patientTick(s, m, care ? { medical: 2, doctor: 1 } : {}, 5);
    }
    return { s, p };
  }
  const dead = run(false);
  expect(dead.p.condition).toBe("dead");
  expect(dead.p.transport).toBe("none");
  expect(run(true)).toEqual(run(true));
  expect(run(true).p.health).toBeGreaterThan(12);
});
it("weist einem defekten RTW keinen neuen Patienten zu", () => {
  const s = emsProfile("Defekter RTW"),
    m = s.missions[0],
    v = s.vehicles.find((v) => v.type === "rtw")!;
  attachIncident(s, m);
  attachDynamics(s, m);
  m.control!.briefed = true;
  m.phase = "transport";
  m.dynamics!.hazards.forEach((h) => {
    h.value = 0;
    h.resolved = true;
  });
  m.dynamics!.patients[0].treatment = 100;
  v.status = "scene";
  v.mission = m.id;
  v.assignment = "broken-rtw";
  v.path = [m.pos];
  v.arrive = s.time;
  breakVehicle(s, v, "technical");
  tick(s, s.time + 5, {}, false, false);
  expect(v.patients).toBe(0);
  expect(m.transports).toEqual([]);
  expect(m.dynamics!.patients[0].transport).toBe("scene");
});
it("Versorgungsschwerpunkte wirken nur mit realen Kräften; Priorisierung verteilt knappe Versorgung", () => {
  const s = emsProfile("Versorgung"),
    m = s.missions[0];
  attachIncident(s, m);
  attachDynamics(s, m);
  m.control!.briefed = true;
  const p = m.dynamics!.patients[0];
  p.health = 60;
  p.oxygen = 86;
  const plain = structuredClone(s),
    focused = structuredClone(s),
    unserved = structuredClone(s);
  focused.missions[0].dynamics!.patients[0].care = "oxygen";
  unserved.missions[0].dynamics!.patients[0].care = "oxygen";
  patientTick(plain, plain.missions[0], { medical: 2 }, 5);
  patientTick(focused, focused.missions[0], { medical: 2 }, 5);
  patientTick(unserved, unserved.missions[0], {}, 5);
  expect(focused.missions[0].dynamics!.patients[0].health).toBeGreaterThan(
    plain.missions[0].dynamics!.patients[0].health,
  );
  expect(unserved.missions[0].dynamics!.patients[0].health).toBeLessThan(
    p.health,
  );
  const second = structuredClone(p);
  second.id = "second-patient";
  second.priority = "urgent";
  m.dynamics!.patients.push(second);
  patientTick(s, m, { medical: 2 }, 5);
  expect(second.health).toBeGreaterThan(p.health);
});
it("Wetterwechsel während einer Fahrt passt ETA ohne Positionssprung an", () => {
  const s = dynamic(),
    m = s.missions[0],
    v = s.vehicles[0];
  m.pos = nodes[80];
  alarm(s, m, [v.id], "owner", "NORMAL", "station");
  s.time = v.depart + 1;
  v.status = "travel";
  v.journey!.nextCheck = s.time;
  const origin = vehiclePosition(v, s.time),
    eta = v.arrive;
  s.environment!.period++;
  s.environment!.rain = 80;
  s.environment!.density = 1.7;
  trafficTick(s, v);
  expect(distance(v.path[0], origin)).toBeLessThan(0.001);
  expect(v.arrive).toBeGreaterThan(eta);
  expect(v.journey!.reason).toContain("Wetter");
});
it("Folgeereignisse sind verknüpft und warten auf freien Platz sowie Mindestabstand", () => {
  const s = dynamic(),
    m = s.missions[0];
  m.dynamics!.pending = { template: "bin", due: s.time };
  s.missionWait = 20;
  followupsTick(s);
  expect(s.missions).toHaveLength(1);
  s.missionWait = 0;
  followupsTick(s);
  expect(s.missions).toHaveLength(2);
  expect(s.missions[1].dynamics!.parent).toBe(m.id);
  expect(s.missions[1].control!.calls[0].state).toBe("ringing");
  followupsTick(s);
  expect(m.dynamics!.children).toHaveLength(1);
  expect(s.missions[1].shared).toBe(false);
});
it("verbirgt Gefahren, Patienten und Zufall bis zur Erkundung; bewahrt deterministische Fortsetzung nach SQLite-Neustart", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-dynamics-"));
  let db = new Database(dir);
  const id = await new Auth(db).create(
    "dynamics",
    "strong-test-password-123",
    "D",
    "D",
  );
  const s = dynamic(),
    m = s.missions[0];
  s.player.id = id;
  s.buildings.forEach((b) => (b.owner = id));
  s.vehicles.forEach((v) => (v.owner = id));
  m.control!.briefed = false;
  expect(publicSave(s).missions[0].dynamics).toBeUndefined();
  m.control!.briefed = true;
  expect(publicSave(s).missions[0].dynamics?.random).toBeUndefined();
  db.save(id, s);
  db.close();
  db = new Database(dir);
  const reloaded = db.all().get(id)!;
  for (let i = 0; i < 100; i++) {
    tick(s, s.time + 5, {}, false, false);
    tick(reloaded, reloaded.time + 5, {}, false, false);
  }
  expect(reloaded).toEqual(s);
  db.close();
});
it("migriert Schema 6 ohne nachträgliche Gefahr oder Änderung laufender Fahrten und sichert Originaldaten", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-v7-"));
  let db = new Database(dir);
  const id = await new Auth(db).create(
    "migration",
    "strong-test-password-123",
    "D",
    "D",
  );
  const s = phaseFixture(id);
  alarm(
    s,
    {
      ...s.missions[0],
      control: {
        ...s.missions[0].control!,
        locationKnown: true,
        reportedTemplate: "field",
      },
    },
    [s.vehicles[0].id],
    id,
  );
  const original = structuredClone(s);
  db.save(id, s);
  db.sql.exec("PRAGMA user_version=6");
  db.close();
  db = new Database(dir);
  const migrated = db.all().get(id)!;
  expect(migrated.vehicles).toEqual(original.vehicles);
  expect(migrated.money).toBe(original.money);
  expect(migrated.missions[0].dynamics!.active).toBe(false);
  const file = (await readdir(dir)).find((x) =>
    x.startsWith("pre-migration-v2-"),
  )!;
  const copy = new DatabaseSync(resolve(dir, file), { readOnly: true });
  expect(copy.prepare("PRAGMA user_version").get()!.user_version).toBe(6);
  expect(
    JSON.parse(
      String(
        copy.prepare("SELECT data FROM saves WHERE user_id=?").get(id)!.data,
      ),
    ),
  ).toEqual(original);
  copy.close();
  db.close();
});
it("prüft fremde und doppelte Taktik-/Patienten-/Reparaturaktionen serverseitig", async () => {
  const db = new Database(await mkdtemp(resolve(tmpdir(), "lv-v7-actions-"))),
    auth = new Auth(db),
    game = new Game(db);
  const owner = await auth.create(
      "owner",
      "strong-test-password-123",
      "O",
      "O",
    ),
    other = await auth.create("other", "strong-test-password-123", "X", "X");
  const s = dynamic(),
    m = s.missions[0];
  s.player.id = owner;
  s.buildings.forEach((b) => (b.owner = owner));
  s.vehicles.forEach((v) => (v.owner = owner));
  db.save(owner, s);
  const cmd = {
    id: crypto.randomUUID(),
    action: { type: "tactic", mission: m.id, tactic: "defensive" },
  };
  expect(() => game.command(other, cmd)).toThrow("Eigener laufender Einsatz");
  game.command(owner, cmd);
  game.command(owner, cmd);
  expect(
    db
      .all()
      .get(owner)!
      .missions[0].control!.events.filter((e) => e.type === "TACTIC_CHANGED"),
  ).toHaveLength(1);
  expect(() =>
    game.command(owner, {
      id: crypto.randomUUID(),
      action: { type: "tactic", mission: m.id, tactic: "defensive", random: 0 },
    }),
  ).toThrow();
  expect(() =>
    deskCommand(
      s,
      {
        type: "patient-care",
        mission: m.id,
        patient: "foreign",
        care: "cpr",
        priority: "urgent",
      },
      owner,
    ),
  ).toThrow("Patient");
  db.close();
});
