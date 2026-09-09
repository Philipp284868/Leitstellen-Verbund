import { describe, expect, it, vi } from "vitest";
import { phaseFixture } from "./phase-fixture";
import { addUnit, atScene } from "./phase-four-fixture";
import { alarm, propose } from "../src/simulation/dispatch";
import { attachDynamics, dynamicsTick } from "../src/simulation/dynamics";
import { fireFeedback, fireTick } from "../src/simulation/fire";
import { hazard, requirements } from "../src/simulation/hazards";
import {
  effectiveSkills,
  workingSkills,
} from "../src/simulation/major-resources";
import {
  ensureMissionTasks,
  taskTick,
  tasksComplete,
} from "../src/simulation/mission-tasks";
import {
  assessWithdrawal,
  assessRemoteWithdrawal,
  createWithdrawalAssessment,
  withdraw,
} from "../src/simulation/withdrawal";
import { environmentAt } from "../src/simulation/weather";
import { capacity, tick } from "../src/engine";
import { validate } from "../src/model";
import { setFms } from "../src/simulation/fms";
import { newPatient } from "../src/simulation/patients";
import { declareMajor } from "../src/simulation/major-incidents";
import * as traffic from "../src/simulation/traffic";
import * as resourceSkills from "../src/simulation/major-resources";

function setup(template = "bin") {
  const s = phaseFixture("tasks-owner", template),
    m = s.missions[0];
  attachDynamics(s, m);
  m.control!.briefed = true;
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = template;
  s.environment = {
    ...environmentAt(s.time),
    kind: "cloud",
    wind: 0,
    rain: 0,
    visibility: 15000,
    density: 0,
    roads: [],
  };
  return { s, m };
}
const aao = {
  id: "capability-aao",
  name: "Fähigkeiten",
  keyword: "Brand",
  level: 1,
  org: "Alle" as const,
  types: [] as string[],
  skills: { fire: 1 },
  alarm: "station" as const,
  priority: "NORMAL" as const,
};

describe("fähigkeitsbasierte Disposition und tatsächliche Aufgaben", () => {
  it("benötigt den tatsächlich geforderten Löschwassernachschub, bevor die Brandarbeit voranschreitet", () => {
    const { s, m } = setup("field");
    atScene(s, s.vehicles[0], m.id);
    const fire = m.dynamics!.hazards.find((hazard) => hazard.kind === "fire")!;
    const before = fire.value;
    for (let n = 0; n < 6; n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    expect(fire.value).toBeGreaterThan(before);
    expect(requirements(m).water).toBe(3);
    atScene(s, s.vehicles[1], m.id);
    for (let n = 0; n < 60 && !tasksComplete(m); n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    expect(fire.resolved).toBe(true);
    expect(tasksComplete(m)).toBe(true);
  });
  for (const type of ["tsf", "tlf", "hlf"])
    for (const template of ["bin", "car"])
      it(`${type} beendet ${template} alleine mit FMS, dauerhaften Aufgaben und einmaliger Belohnung`, () => {
        const { s, m } = setup(template);
        const v = addUnit(s, type);
        s.buildings.find((b) => b.id === v.home)!.organization = {
          kind: "bf",
          turnout: 30,
          crew: "normal",
          reserve: 0,
        };
        alarm(s, m, [v.id], s.player.id, "NORMAL", "station");
        for (let n = 0; n < 180 && s.missions.some((x) => x.id === m.id); n++)
          tick(s, s.time + 5, {}, false, false);
        expect(s.archive.some((x) => x.id === m.id)).toBe(true);
        expect(m.tasks?.entries.every((entry) => entry.done)).toBe(true);
        expect(m.dynamics!.fire!.extinguishedAt).toBeGreaterThan(0);
        expect(m.dynamics!.fire!.intensity).toBe(0);
        expect(
          m.control!.events.some((e) => e.type === "MISSION_TASK_COMPLETED"),
        ).toBe(true);
        const money = s.money,
          xp = s.xp;
        tick(s, s.time + 100, {}, false, false);
        expect([s.money, s.xp]).toEqual([money, xp]);
        expect(validate(s)).toBeTruthy();
      });

  it("wählt Fähigkeiten ohne Typvorgabe und ersetzt gesperrte Löschfahrzeuge durch geeignete Alternativen", () => {
    const { s, m } = setup();
    const hlf = s.vehicles.find((v) => v.type === "hlf")!;
    setFms(s, hlf, 6, "owner", "Wartung");
    const unsuitable = addUnit(s, "rtw");
    propose(s, m, aao, "owner");
    expect(m.control!.proposal!.vehicles).toEqual([
      s.vehicles.find((v) => v.type === "tlf")!.id,
    ]);
    expect(m.control!.proposal!.vehicles).not.toContain(unsuitable.id);
    expect(m.control!.proposal!.missing).toEqual([]);
  });

  it("respektiert explizite Typwünsche und verrät vor Erkundung keine Spezialanforderungen", () => {
    const { s, m } = setup("factory");
    m.control!.briefed = false;
    m.control!.reportedTemplate = "reported-fire";
    const tlf = s.vehicles.find((v) => v.type === "tlf")!;
    propose(s, m, { ...aao, types: ["tlf"] }, "owner");
    expect(m.control!.proposal!.vehicles).toEqual([tlf.id]);
    expect(m.control!.proposal!.missing).toEqual([]);
    expect(fireFeedback(m)).toBeNull();
    m.control!.briefed = true;
    propose(s, m, aao, "owner");
    expect(m.control!.proposal!.missing.length).toBeGreaterThan(0);
    expect(m.control!.proposal!.missing.join()).not.toContain("HLF");
  });

  it("erhält Spezialbedarf und lässt eine Crew Brand und technische Rettung nacheinander bearbeiten", () => {
    const { s, m } = setup();
    const hlf = s.vehicles.find((v) => v.type === "hlf")!;
    atScene(s, hlf, m.id);
    m.dynamics!.hazards.push(hazard("technical", "rescue", 20, 0, 2));
    const technical = m.dynamics!.hazards.at(-1)!;
    expect(effectiveSkills(m, hlf).rescue).toBe(2);
    expect(workingSkills(m, hlf).rescue).toBeUndefined();
    s.time += 5;
    dynamicsTick(s, m);
    expect(technical.value).toBe(20);
    for (let n = 0; n < 100 && !tasksComplete(m); n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    for (let n = 0; n < 20 && !technical.resolved; n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    expect(technical.resolved).toBe(true);
    expect(m.dynamics!.fire!.intensity).toBe(0);
    m.dynamics!.hazards.push(hazard("hazmat", "hazmat", 10, 0));
    expect(requirements(m).hazmat).toBe(1);
    expect(capacity(s, m.id).hazmat).toBeUndefined();
  });

  it("meldet echte serverseitige Trends und kann einen erledigten Brand nicht durch Kräfteabzug neu starten", () => {
    const { s, m } = setup();
    const before = m.dynamics!.fire!.intensity;
    s.time += 5;
    dynamicsTick(s, m);
    expect(fireFeedback(m)?.state).toBe("spreading");
    expect(fireFeedback(m)!.intensity).toBeGreaterThan(before);
    atScene(s, s.vehicles[0], m.id);
    s.time += 5;
    dynamicsTick(s, m);
    expect(fireFeedback(m)?.trend).toBe("falling");
    for (let n = 0; n < 100 && !tasksComplete(m); n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    const completion = m.tasks!.entries.map((entry) => entry.completedAt);
    const extinguished = m.dynamics!.fire!.extinguishedAt;
    withdraw(s, m, [s.vehicles[0].id], "owner");
    const persisted = s.missions.find((entry) => entry.id === m.id)!;
    s.time += 100;
    dynamicsTick(s, persisted);
    expect(persisted.dynamics!.fire!.intensity).toBe(0);
    expect(persisted.dynamics!.fire!.extinguishedAt).toBe(extinguished);
    expect(persisted.tasks!.entries.map((entry) => entry.completedAt)).toEqual(
      completion,
    );
    expect(requirements(persisted).fire).toBeUndefined();
    expect(fireFeedback(persisted)?.state).toBe("extinguished");
    tick(s, s.time + 5, {}, false, false);
    expect(s.archive.some((entry) => entry.id === m.id)).toBe(true);
    const money = s.money;
    tick(s, s.time + 60, {}, false, false);
    expect(s.money).toBe(money);
  });

  it("migriert nur additive Aufgaben, bewahrt Fortschritt und bereits erledigte Gefahren", () => {
    const { s, m } = setup();
    delete m.tasks;
    m.progress = 7;
    m.dynamics!.hazards.forEach((h) => {
      h.resolved = true;
      h.value = 0;
    });
    fireTick(s, m, {}, 0);
    const seed = s.seed,
      dynamicSeed = m.dynamics!.random;
    ensureMissionTasks(s, m);
    expect(
      m.tasks!.entries.find((entry) => entry.id === "capability:fire")!.done,
    ).toBe(true);
    expect(
      m.tasks!.entries.find((entry) => entry.id === "fire-aftercare")!.done,
    ).toBe(false);
    const first = JSON.stringify(m.tasks);
    ensureMissionTasks(s, m);
    expect(JSON.stringify(m.tasks)).toBe(first);
    expect([s.seed, m.dynamics!.random, m.progress]).toEqual([
      seed,
      dynamicSeed,
      7,
    ]);
    expect(validate(JSON.parse(JSON.stringify(s)))).toBeTruthy();
  });
  it("eröffnet ein vollständig gelöschtes Feuer auch bei späterer Großlagenerklärung nicht erneut", () => {
    const { s, m } = setup("field");
    s.vehicles.forEach((v) => atScene(s, v, m.id));
    for (let n = 0; n < 100 && !tasksComplete(m); n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    const before = JSON.stringify(m.dynamics!.hazards);
    const completedAt = m.dynamics!.fire!.extinguishedAt;
    declareMajor(s, m);
    expect(JSON.stringify(m.dynamics!.hazards)).toBe(before);
    expect(m.dynamics!.fire!.extinguishedAt).toBe(completedAt);
    expect(
      m.tasks!.entries.find((entry) => entry.id === "capability:fire")!.done,
    ).toBe(true);
  });

  it("erzwingt echte Arbeit für zusätzliche Rettungsaufgaben auch nach erledigtem Feuer", () => {
    const { s, m } = setup();
    m.dynamics!.extra.ladder = 1;
    taskTick(s, m, {}, 5);
    expect(requirements(m).ladder).toBe(1);
    const extra = m.tasks!.entries.find(
      (entry) => entry.id === "additional:ladder:1",
    )!;
    expect(extra.done).toBe(false);
    taskTick(s, m, { ladder: 1 }, 20);
    expect(extra.done).toBe(true);
    expect(requirements(m).ladder).toBeUndefined();
  });

  it("reproduziert Aufgaben, Brand und Abschlussdaten nach Speichern und Wiederaufnahme", () => {
    const { s, m } = setup();
    atScene(s, s.vehicles[0], m.id);
    for (let i = 0; i < 4; i++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    const loaded = validate(JSON.parse(JSON.stringify(s)));
    for (let i = 0; i < 24; i++) {
      s.time += 5;
      dynamicsTick(s, m);
      loaded.time += 5;
      dynamicsTick(loaded, loaded.missions[0]);
    }
    expect(loaded.missions[0].tasks).toEqual(m.tasks);
    expect(loaded.missions[0].dynamics).toEqual(m.dynamics);
  });
});

describe("atomarer bedarfsgerechter Kräfteabzug", () => {
  it("indiziert 500 Einsatzfahrzeuge einmal je Snapshot statt für jede einzelne sichtbare Zeile erneut", () => {
    const { s, m } = setup();
    while (s.vehicles.length < 500) addUnit(s, "hlf");
    for (const v of s.vehicles) atScene(s, v, m.id);
    const before = JSON.stringify(s);
    const spy = vi.spyOn(resourceSkills, "effectiveSkills");
    try {
      const preview = createWithdrawalAssessment(s, m);
      expect(spy).toHaveBeenCalledTimes(500);
      for (const v of s.vehicles) expect(preview([v.id]).allowed).toBe(true);
      expect(preview(s.vehicles.map((v) => v.id)).allowed).toBe(false);
      expect(spy).toHaveBeenCalledTimes(500);
      expect(JSON.stringify(s)).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });
  it("lässt fertig arbeitende Feuerwehr abfahren, während Rettungsdienst und tatsächliche Patientenversorgung offen bleiben", () => {
    const { s, m } = setup();
    const hlf = s.vehicles[0];
    atScene(s, hlf, m.id);
    const patient = newPatient(s, m, "Verletzung");
    patient.health = 65;
    patient.treatment = 0;
    m.dynamics!.patients.push(patient);
    for (let n = 0; n < 30 && !tasksComplete(m); n++) {
      s.time += 5;
      dynamicsTick(s, m);
    }
    expect(tasksComplete(m)).toBe(true);
    expect(patient.transport).toBe("scene");
    expect(requirements(m).fire).toBeUndefined();
    expect(requirements(m).medical).toBe(2);
    withdraw(s, m, [hlf.id], "owner");
    const live = s.missions[0];
    const rtw = addUnit(s, "rtw");
    atScene(s, rtw, live.id);
    expect(assessWithdrawal(s, live, [rtw.id]).allowed).toBe(false);
    for (
      let n = 0;
      n < 600 && s.missions.some((entry) => entry.id === live.id);
      n++
    )
      tick(s, s.time + 5, {}, false, false);
    expect(s.archive.some((entry) => entry.id === live.id)).toBe(true);
    expect(live.dynamics!.fire!.intensity).toBe(0);
    expect(live.dynamics!.patients[0].transport).toBe("delivered");
  });

  it("weist gemeinsamen Abzug zurück, obwohl jedes einzelne Fahrzeug redundant wäre", () => {
    const { s, m } = setup();
    s.vehicles.forEach((v) => atScene(s, v, m.id));
    const ids = s.vehicles.map((v) => v.id);
    expect(assessWithdrawal(s, m, [ids[0]]).allowed).toBe(true);
    expect(assessWithdrawal(s, m, [ids[1]]).allowed).toBe(true);
    const before = JSON.stringify(s);
    expect(assessWithdrawal(s, m, ids).allowed).toBe(false);
    expect(() => withdraw(s, m, ids, "owner")).toThrow("Löschmittel");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("gibt überschüssige Kräfte frei, protokolliert einmalig und weist Wiederholung oder Fremd-IDs zurück", () => {
    const { s, m } = setup();
    s.vehicles.forEach((v) => atScene(s, v, m.id));
    const id = s.vehicles[0].id,
      other = s.vehicles[1].id;
    withdraw(s, m, [id, id], "owner");
    expect(s.vehicles.find((v) => v.id === id)!.status).toBe("return");
    expect(s.vehicles.find((v) => v.id === other)!.status).toBe("scene");
    expect(
      s.missions[0].control!.events.filter(
        (event) => event.type === "FORCES_WITHDRAWN",
      ),
    ).toHaveLength(1);
    const before = JSON.stringify(s);
    expect(() => withdraw(s, s.missions[0], [id], "owner")).toThrow();
    expect(() => withdraw(s, s.missions[0], ["not-owned"], "owner")).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("bindet tatsächliche Patienten unabhängig von verfügbarer Ersatzkapazität", () => {
    const { s, m } = setup();
    s.vehicles.forEach((v) => atScene(s, v, m.id));
    const v = addUnit(s, "rtw");
    atScene(s, v, m.id);
    v.patients = 1;
    const before = JSON.stringify(s);
    expect(() =>
      withdraw(s, m, [v.id], "owner", { medical: 100, transport: 100 }),
    ).toThrow("Patienten");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("zählt verifizierte Helferressourcen einmal und lässt unerkundete Lagen nicht freigeben", () => {
    const { s, m } = setup();
    const v = s.vehicles[0];
    atScene(s, v, m.id);
    expect(assessWithdrawal(s, m, [v.id], { fire: 1 }).allowed).toBe(true);
    expect(assessWithdrawal(s, m, [v.id], {}).allowed).toBe(false);
    m.control!.briefed = false;
    expect(assessWithdrawal(s, m, [v.id], { fire: 20 }).allowed).toBe(false);
  });
  it("bewahrt den vollständigen Originalstand, wenn erst die zweite Rückroute fehlschlägt", () => {
    const { s, m } = setup();
    s.vehicles.forEach((v) => atScene(s, v, m.id));
    const original = traffic.routePlan;
    let routes = 0;
    const spy = vi.spyOn(traffic, "routePlan").mockImplementation((...args) => {
      if (++routes === 2) throw Error("Keine sichere Rückroute");
      return original(...args);
    });
    const before = JSON.stringify(s);
    try {
      expect(() =>
        withdraw(
          s,
          m,
          s.vehicles.map((v) => v.id),
          "owner",
          { fire: 10 },
        ),
      ).toThrow("Rückroute");
      expect(routes).toBe(2);
      expect(JSON.stringify(s)).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });
  it("behält Kräfte in offenen Abschnitten und die tatsächlich benannte Abschnittsleitung", () => {
    const { s, m } = setup("field");
    declareMajor(s, m);
    const elw = addUnit(s, "elw"),
      rescue = s.vehicles[0];
    atScene(s, elw, m.id);
    atScene(s, rescue, m.id);
    m.major!.placements.push(
      { vehicle: elw.id, assignment: elw.assignment!, section: "command" },
      { vehicle: rescue.id, assignment: rescue.assignment!, section: "rescue" },
    );
    const section = m.major!.sections.find(
      (section) => section.kind === "rescue",
    )!;
    section.ordered = true;
    section.leader = { vehicle: elw.id, assignment: elw.assignment! };
    expect(
      assessWithdrawal(s, m, [rescue.id], {
        fire: 20,
        rescue: 20,
        command: 20,
      }).reasons.join(),
    ).toContain("letzte zugeordnete Kräfte");
    expect(
      assessWithdrawal(s, m, [elw.id], {
        fire: 20,
        rescue: 20,
        command: 20,
      }).reasons.join(),
    ).toContain("Abschnittsleitung");
  });
  it("prüft Helferrückruf gegen die echte Besitzerlage ohne erfundene Besitzrechte oder doppelte Kräfte", () => {
    const { s, m } = setup();
    const helper = structuredClone(s.vehicles[0]);
    helper.id = "helper-unit";
    helper.owner = "helper-desk";
    helper.mission = `remote:${s.player.id}:${m.id}`;
    helper.status = "scene";
    helper.arrive = s.time;
    helper.assignment = "helper-assignment";
    expect(
      assessRemoteWithdrawal(s, m, [helper.id], { fire: 2 }, [helper]).allowed,
    ).toBe(false);
    atScene(s, s.vehicles[1], m.id);
    const checked = assessRemoteWithdrawal(s, m, [helper.id], { fire: 2 }, [
      helper,
    ]);
    expect(checked.allowed).toBe(true);
    expect(checked.remaining.fire).toBe(1);
    expect(
      assessRemoteWithdrawal(s, m, [s.vehicles[1].id], { fire: 2 }, [helper])
        .allowed,
    ).toBe(false);
    helper.patients = 1;
    expect(
      assessRemoteWithdrawal(s, m, [helper.id], { fire: 2 }, [
        helper,
      ]).reasons.join(),
    ).toContain("Patienten");
  });
});
