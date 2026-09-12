import { describe, expect, it } from "vitest";
import { missions, mt, vehicles } from "../src/shared/catalog";
import { tick } from "../src/shared/engine";
import { validate } from "../src/shared/model";
import { xpForLevel } from "../src/shared/progression";
import { callAction } from "../src/simulation/calls";
import { alarm, propose } from "../src/simulation/dispatch";
import {
  attachDynamics,
  dynamicsComplete,
  dynamicsTick,
  followupsTick,
} from "../src/simulation/dynamics";
import {
  canGenerate,
  capabilitiesUnlocked,
  generationRequirements,
} from "../src/simulation/feasibility";
import { publicHospitalProfile } from "../src/simulation/hospital-profiles";
import { assessHospitals } from "../src/simulation/hospitals";
import { radioAction, request } from "../src/simulation/incidents";
import { phaseFixture } from "./dispatch-fixture";
import { sites as nodes } from "./fixtures/germany/locations";

import { taskTick } from "../src/simulation/mission-tasks";

function dynamic(template = "field") {
  const s = phaseFixture("quality-owner", template),
    m = s.missions[0];
  attachDynamics(s, m);
  m.control!.briefed = true;
  m.control!.reportedTemplate = m.template;
  m.control!.locationKnown = true;
  return { s, m, d: m.dynamics! };
}

describe("Fachliche Abschluss- und Informationsinvarianten", () => {
  it("belohnt keinen Einsatz in der Transportphase mit einer noch offenen Gefahr", () => {
    const { s, m, d } = dynamic();
    m.phase = "transport";
    m.progress = mt(m.template).seconds;
    d.aftermath = s.time - 20;
    const money = s.money,
      xp = s.xp;
    tick(s, s.time + 1, {}, false, false);
    expect(s.missions.map((m) => m.id)).toContain(m.id);
    expect(s.archive).toHaveLength(0);
    expect(s.money).toBe(money);
    expect(s.xp).toBe(xp);
    expect(validate(s)).toBeTruthy();
  });

  it("wartet auch nach beendetem Transport auf notwendige Organisationsaufgaben", () => {
    const { s, m, d } = dynamic();
    m.phase = "transport";
    m.progress = mt(m.template).seconds;
    d.hazards.forEach((h) => {
      h.value = 0;
      h.resolved = true;
    });
    taskTick(s, m, { fire: 2, water: 3 }, mt(m.template).seconds);
    d.aftermath = s.time - 20;
    m.organization = {
      tasks: [
        {
          kind: "secure",
          ordered: true,
          progress: 0,
          seconds: 30,
          done: false,
        },
      ],
    };
    tick(s, s.time + 1, {}, false, false);
    expect(s.missions).toContain(m);
    m.organization.tasks[0].done = true;
    tick(s, s.time + 1, {}, false, false);
    expect(s.archive[0].id).toBe(m.id);
    const earned = { xp: s.xp, money: s.money, completed: s.completed };
    tick(s, s.time + 60, {}, false, false);
    expect({ xp: s.xp, money: s.money, completed: s.completed }).toEqual(
      earned,
    );
  });

  it("beginnt die Nachkontrolle nach einer erneuten Gefahr vollständig neu", () => {
    const { s, m, d } = dynamic("tree");
    d.aftermath = s.time - 20;
    s.time += 5;
    dynamicsTick(s, m);
    expect(d.aftermath).toBe(0);
    d.hazards.forEach((h) => {
      h.value = 0;
      h.resolved = true;
    });
    s.time += 5;
    dynamicsTick(s, m);
    expect(d.aftermath).toBe(s.time + 15);
    expect(dynamicsComplete(m, s.time + 14)).toBe(false);
    expect(dynamicsComplete(m, s.time + 15)).toBe(true);
  });

  it.each(["close", "request", "question"] as const)(
    "bestätigt die erste Lagemeldung nicht durch %s",
    (op) => {
      const { s, m } = dynamic();
      m.control!.briefed = false;
      request(s, m, s.vehicles[0].id, "arrival", "Erste Erkundung liegt vor.");
      const r = m.control!.radio[0];
      expect(() => radioAction(s, m, r.id, op, s.player.id)).toThrow(
        /Lagemeldung/,
      );
      expect(m.control!.briefed).toBe(false);
      expect(r.state).toBe("open");
      radioAction(s, m, r.id, "report", s.player.id);
      radioAction(s, m, r.id, "report", s.player.id);
      expect(
        m.control!.events.filter((e) => e.type === "REPORT_RECEIVED"),
      ).toHaveLength(1);
    },
  );

  it("bewahrt bestätigte Lageinformationen neben einer später erfragten unbestätigten Meldung", () => {
    const { s, m } = dynamic();
    const call = m.control!.calls[0];
    callAction(s, m, call.id, "accept", s.player.id);
    callAction(s, m, call.id, "ask", s.player.id, "report");
    expect(m.control!.reportedTemplate).toBe("field");
    expect(m.control!.facts.find((f) => f.key === "report")?.text).toMatch(
      /Rauch|Flammen|Funken/,
    );
    expect(m.control!.facts.find((f) => f.key === "report")?.text).not.toBe(
      mt("bin").name,
    );
    expect(m.control!.facts.find((f) => f.key === "report")?.confidence).toBe(
      "unbestätigt",
    );
  });
});

describe("Ehrliche Klinikprofile und passende Aufnahme", () => {
  const facilities = Array.from({ length: 20 }, (_, i) =>
    publicHospitalProfile({
      id: `node:${i}`,
      name: `OSM-Testklinik ${i}`,
      ...nodes[20 + i],
    }),
  );
  const basic = facilities.find((h) => h.specialties.length === 1)!;
  const comprehensive = facilities.find((h) => h.specialties.length === 5)!;

  it("bewahrt Klinikidentitäten und leitet unabhängig von Seed oder Name gekennzeichnete unterschiedliche Spielprofile ab", () => {
    expect(new Set(facilities.map((h) => h.specialties.join(","))).size).toBe(
      4,
    );
    for (let i = 0; i < 20; i++) {
      const a = facilities[i];
      const b = publicHospitalProfile({
        id: `node:${i}`,
        name: "Umbenannt",
        ...nodes[20 + i],
      });
      expect(b.id).toBe(a.id);
      expect(b.specialties).toEqual(a.specialties);
      expect(b.capacity).toBe(a.capacity);
      expect(b.profileSource).toBe("simulation-v1");
      expect(b.name).toContain("Spielprofil:");
    }
  });

  it("weist ein Kind mit Verbrennungen an ein passendes Profil statt an jeden geografischen Klinikpunkt", () => {
    const { s, m, d } = dynamic("sick");
    d.patients[0].age = 10;
    d.patients[0].injury = "Verbrennungen";
    const choices = assessHospitals(s, [basic, comprehensive], m.pos, 1, m);
    expect(choices.find((h) => h.id === basic.id)!.reason).toContain(
      "Kinderheilkunde",
    );
    expect(choices.find((h) => h.id === basic.id)!.reason).toContain(
      "Brandverletzungen",
    );
    expect(choices.find((h) => h.id === comprehensive.id)!.reason).toBe("");
    const persisted = validate(s);
    expect(
      assessHospitals(
        persisted,
        [basic, comprehensive],
        m.pos,
        1,
        persisted.missions[0],
      ),
    ).toEqual(choices);
    s.beds = Array.from({ length: comprehensive.capacity }, (_, i) => ({
      id: `bed-${i}`,
      home: comprehensive.id,
      until: s.time + 100,
    }));
    expect(assessHospitals(s, [comprehensive], m.pos, 1, m)[0].reason).toBe(
      "Keine freie Aufnahme",
    );
  });

  it("behält den Intensivbedarf eines schon stabilisierten Intensivtransportpatienten", () => {
    const t = missions.find((t) => t.profile?.patient.intensive)!;
    const { s, m, d } = dynamic(t.id);
    for (const p of d.patients) {
      p.age = 40;
      p.condition = "recovering";
      p.health = 90;
      p.treatment = 100;
      p.cprCycles = 0;
    }
    expect(assessHospitals(s, [basic], m.pos, 1, m)[0].reason).toContain(
      "Intensivmedizin",
    );
  });
});

describe("Erfüllbare Generierung und gemeinsame Besatzungsplanung", () => {
  it("fordert einen bereits beim ersten Befund nötigen Notarzt vor der Generierung als verfügbare Fähigkeit", () => {
    const { s } = dynamic();
    const t = missions.find(
      (t) =>
        t.profile?.patientCount &&
        t.profile.patient.health < 35 &&
        !t.requirements.doctor,
    )!;
    expect(t).toBeDefined();
    expect(generationRequirements(t).doctor).toBe(1);
    const all = Object.fromEntries(
      vehicles
        .flatMap((v) => Object.keys(v.skills))
        .map((skill) => [skill, 100]),
    );
    s.xp = xpForLevel(4);
    expect(canGenerate(s, t, all)).toBe(false);
    s.xp = xpForLevel(30);
    expect(canGenerate(s, t, { ...all, doctor: 0 })).toBe(false);
    expect(canGenerate(s, t, all)).toBe(true);
    expect(capabilitiesUnlocked(s, { doctor: 1 })).toBe(true);
  });

  it("berücksichtigt jede im Profil bereits vorhandene Gefahr bei der Generierung", () => {
    for (const t of missions.filter((t) => t.profile))
      for (const h of t.profile!.hazards)
        expect(generationRequirements(t)[h.skill]).toBeGreaterThanOrEqual(
          h.required,
        );
  });

  it("behält einen noch nicht erfüllbaren Folgeeinsatz über Wiederherstellung bei, ohne andere zu blockieren", () => {
    const { s, m, d } = dynamic();
    d.pending = { template: "flat", due: s.time };
    const other = structuredClone(m);
    other.id = "other-parent";
    other.round = "other-round";
    other.dynamics!.pending = { template: "bin", due: s.time };
    s.missions.push(other);
    s.missionWait = 0;
    const restored = validate(s);
    for (const save of [s, restored]) followupsTick(save);
    expect(restored).toEqual(s);
    expect(d.pending?.template).toBe("flat");
    expect(s.missions.at(-1)!.template).toBe("bin");
    expect(s.missions.at(-1)!.dynamics!.parent).toBe("other-parent");
  });

  it("plant dieselben sechs Freiwilligen nicht gleichzeitig für zwei HLF ein", () => {
    const { s, m } = dynamic();
    s.buildings[0].organization!.kind = "ff";
    s.people = s.people.slice(0, 6);
    s.people.forEach((p) => {
      p.vehicle = null;
    });
    s.vehicles[1].type = "hlf";
    const before = structuredClone(s.people);
    const aao = {
      ...s.desk.aaos[0],
      id: "same-pool",
      name: "Zwei HLF",
      org: "Alle" as const,
      types: ["hlf", "hlf"],
      skills: {},
      alarm: "dme" as const,
    };
    propose(s, m, aao, s.player.id);
    expect(m.control!.proposal!.vehicles).toHaveLength(1);
    expect(m.control!.proposal!.missing.join(" ")).toContain("Fehlt:");
    expect(s.people).toEqual(before);
    const snapshot = structuredClone(s);
    expect(() =>
      alarm(
        s,
        m,
        s.vehicles.map((v) => v.id),
        s.player.id,
      ),
    ).toThrow(/Besatzung/);
    expect(s).toEqual(snapshot);
  });

  it("protokolliert den tatsächlichen Bruchteil einer Sekunde beim Ausrücken unabhängig von der Tickgrenze", () => {
    const { s, m } = dynamic();
    s.time += 0.25;
    alarm(s, m, [s.vehicles[0].id], s.player.id);
    const depart = s.vehicles[0].depart;
    tick(s, depart + 0.4, {}, false, false);
    expect(
      m.control!.events.find((e) => e.type === "VEHICLE_DEPARTED")!.at,
    ).toBe(depart);
    expect(s.desk.fleet[s.vehicles[0].id].code).toBe(3);
  });
});
