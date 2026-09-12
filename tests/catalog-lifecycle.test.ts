import { ensureWaterSupply } from "../src/simulation/water-supply";
import { expect, it } from "vitest";
import { vehicles, vt, type Template } from "../src/shared/catalog";
import { incidentVariants } from "../src/shared/catalog/incident-variants";
import { capacity, missing, tick } from "../src/shared/engine";
import { fresh, validate, type Mission } from "../src/shared/model";
import { attachIncident } from "../src/simulation/calls";
import { attachDynamics, dynamicsTick } from "../src/simulation/dynamics";
import { dynamicsSchema } from "../src/simulation/dynamics-schema";
import { simId } from "../src/simulation/events";
import { breakVehicle, repairVehicle } from "../src/simulation/faults";
import { requirements } from "../src/simulation/hazards";
import { declareMajor } from "../src/simulation/major-incidents";
import {
  effectiveSkills,
  responseCrewAvailable,
  sectionSkills,
} from "../src/simulation/major-resources";
import { attachOrganizations } from "../src/simulation/organizations";
import {
  injuryReason,
  syncResponderRecovery,
} from "../src/simulation/responder-recovery";
import { personAvailable } from "../src/simulation/staffing";
import { hospitalAt } from "../src/shared/world";
import { sites as nodes } from "./fixtures/germany/locations";
import { addUnit, atScene } from "./incident-dynamics-fixture";

function setup(t: Template) {
  const s = fresh(
    "Audit",
    "Vollständiger Abschluss",
    Date.UTC(2026, 5, 15, 12) / 1000,
  );
  s.generation = "11111111-2222-4333-8444-555555555555";
  s.seed = 812;
  const m: Mission = {
    id: "incident",
    template: t.id,
    pos: (() => {
      const p = hospitalAt(nodes[0]);
      return { x: p.x, y: p.y };
    })(),
    progress: 0,
    phase: "offered",
    created: s.time,
    completed: 0,
    shared: false,
    round: "round",
    contributors: [],
    transports: [],
  };
  s.missions = [m];
  attachIncident(s, m);
  attachDynamics(s, m);
  attachOrganizations(m);
  m.control!.briefed = true;
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = t.id;
  m.organization!.tasks.forEach((task) => (task.ordered = true));
  const supplied: Record<string, number> = {},
    needs = requirements(m);
  const candidates = vehicles.filter((v) => v.mode !== "water");
  while (Object.entries(needs).some(([k, n]) => (supplied[k] || 0) < n)) {
    const best = [...candidates].sort(
      (a, b) =>
        Object.entries(b.skills).reduce(
          (score, [k, n]) =>
            score +
            Math.min(n, Math.max(0, (needs[k] || 0) - (supplied[k] || 0))),
          0,
        ) -
        Object.entries(a.skills).reduce(
          (score, [k, n]) =>
            score +
            Math.min(n, Math.max(0, (needs[k] || 0) - (supplied[k] || 0))),
          0,
        ),
    )[0];
    const unit = addUnit(s, best.id);
    atScene(s, unit, m.id);
    for (const [k, n] of Object.entries(best.skills))
      supplied[k] = (supplied[k] || 0) + n;
    if (s.vehicles.length > 50) throw Error(`Unlösbare Kräfteauswahl: ${t.id}`);
  }
  if (m.dynamics?.fire) {
    atScene(s, addUnit(s, "lf"), m.id);
    atScene(s, addUnit(s, "tlf"), m.id);
    ensureWaterSupply(s, m)!.source = "shuttle";
  }
  expect(missing(m, capacity(s, m.id))).toEqual([]);
  return { s, m };
}
it("hält auch mehr als 500 tatsächlich zugeordnete Einsatzkräfte im Roster und im Speicherschema", () => {
  const t = incidentVariants.find(
      (t) =>
        t.profile!.topic === "Mülleimerbrand" &&
        t.profile!.variant === "reported",
    )!,
    { s, m } = setup(t);
  for (let i = 0; i < 60; i++) atScene(s, addUnit(s, "hlf"), m.id);
  s.time += 5;
  dynamicsTick(s, m);
  expect(m.dynamics!.responders!.length).toBe(
    s.people.filter((p) => p.vehicle).length,
  );
  expect(m.dynamics!.responders!.length).toBeGreaterThan(500);
  expect(dynamicsSchema.parse(m.dynamics).responders).toHaveLength(
    m.dynamics!.responders!.length,
  );
});
it("eine neue vollständige Fahrzeugbesatzung wird nicht durch eine alte verletzte Zuweisung blockiert", () => {
  const t = incidentVariants.find(
      (t) =>
        t.profile!.topic === "VU mit Verletzten" &&
        t.profile!.variant === "reported",
    )!,
    { s, m } = setup(t);
  const vehicle = s.vehicles.find((v) => vt(v.type).home === "ems")!;
  breakVehicle(s, vehicle, "accident");
  vehicle.fault!.state = "repaired";
  const responder = m.dynamics!.responders!.find(
      (r) => r.vehicle === vehicle.id,
    )!,
    person = s.people.find((p) => p.id === responder.person)!;
  expect(responseCrewAvailable(m, vehicle)).toBe(false);
  person.vehicle = null;
  s.people.push({
    ...person,
    id: simId(s),
    vehicle: vehicle.id,
    injury: undefined,
  });
  vehicle.assignment = simId(s);
  s.time += 5;
  dynamicsTick(s, m);
  expect(responseCrewAvailable(m, vehicle)).toBe(true);
  expect(effectiveSkills(m, vehicle)).toEqual(vt(vehicle.type).skills);
  expect(injuryReason(s, person)).toContain("verletzt");
});
const cases = incidentVariants.filter((t) => !t.profile!.major && !t.water);

it.each(cases.map((t) => [t.name, t] as const))(
  "schließt %s mit Organisationsaufträgen und gegebenenfalls echten Klinikfahrten ab",
  (_name, t) => {
    const { s, m } = setup(t);
    for (let i = 0; i < 180 && s.missions.length; i++) {
      for (const v of s.vehicles)
        if (v.fault?.state === "awaiting") repairVehicle(s, v, "test");
      tick(s, s.time + 10, {}, false, false);
    }
    expect(s.archive.map((m) => m.id)).toContain(m.id);
    expect(m.organization!.tasks.every((t) => t.done)).toBe(true);
    expect(m.dynamics!.hazards.every((h) => h.resolved)).toBe(true);
    for (const p of m.dynamics!.patients)
      expect(["delivered", "none"]).toContain(p.transport);
    if (m.dynamics!.patients.some((p) => p.transport === "delivered")) {
      expect(m.transports.some((t) => t.status === "delivered")).toBe(true);
      expect(m.control!.events.some((e) => e.text.startsWith("FMS 7:"))).toBe(
        true,
      );
    }
    const money = s.money,
      xp = s.xp;
    tick(s, s.time + 600, {}, false, false);
    expect(s.money).toBe(money);
    expect(s.xp).toBe(xp);
    expect(validate(s)).toBeTruthy();
  },
  15000,
);

it.each(["manv", "fire", "flood", "storm", "crowd"] as const)(
  "schließt neue Großlage %s mit Führung, echten Abschnitten und gegebenenfalls Nacherkundung/Patientenübergaben ab",
  (kind) => {
    const t = incidentVariants.find(
        (t) => t.profile!.major === kind && !t.water,
      )!,
      { s, m } = setup(t);
    declareMajor(s, m);
    m.major!.sections.forEach((section) => (section.ordered = true));
    m.major!.transports = true;
    // Place real vehicles into sections; a resource cannot count in two sections at once.
    for (const section of m.major!.sections) {
      const relevant = sectionSkills[section.kind];
      const requirementsHere = Object.entries(requirements(m)).filter(
        ([skill]) => relevant.includes(skill),
      );
      if (!requirementsHere.length) requirementsHere.push([relevant[0], 1]);
      for (const [skill, n] of requirementsHere) {
        const type = vehicles
          .filter((v) => v.mode !== "water" && (v.skills[skill] || 0) > 0)
          .sort((a, b) => (b.skills[skill] || 0) - (a.skills[skill] || 0))[0];
        for (let i = 0; i < Math.ceil(n / type.skills[skill]); i++) {
          const v = addUnit(s, type.id);
          atScene(s, v, m.id);
          m.major!.placements.push({
            vehicle: v.id,
            assignment: v.assignment!,
            section: section.kind,
          });
        }
      }
    }
    // Three additional GRTW keep capacity reserved for the announced later patients.
    for (let i = 0; i < 3; i++) {
      const v = addUnit(s, "grtw");
      atScene(s, v, m.id);
      m.major!.placements.push({
        vehicle: v.id,
        assignment: v.assignment!,
        section: "medical",
      });
    }
    for (let i = 0; i < 240 && s.missions.length; i++) {
      for (const p of m.dynamics!.patients) {
        p.triage ??= "II";
        p.care = p.condition === "cpr" ? "cpr" : "standard";
      }
      for (const v of s.vehicles)
        if (v.fault?.state === "awaiting") repairVehicle(s, v, "test");
      tick(s, s.time + 10, {}, false, false);
    }
    expect(s.archive.map((m) => m.id)).toContain(m.id);
    if (kind === "manv" || kind === "crowd")
      expect(m.dynamics!.patients.length).toBeGreaterThan(5);
    expect(m.major!.sections.every((s) => s.done)).toBe(true);
    expect(
      m.transports
        .filter((t) => t.status === "delivered")
        .reduce((n, t) => n + t.patients, 0),
    ).toBe(
      m.dynamics!.patients.filter((p) => p.transport === "delivered").length,
    );
    expect(validate(s)).toBeTruthy();
  },
  30000,
);

it("macht eine tatsächlich gefährdete Einsatzkraft zum Patienten, statt nur einen Text anzuzeigen", () => {
  const t = incidentVariants.find(
      (t) =>
        t.profile!.topic === "VU mit Verletzten" &&
        t.profile!.variant === "reported",
    )!,
    { s, m } = setup(t);
  const vehicle = s.vehicles[0];
  vehicle.assignment = simId(s);
  breakVehicle(s, vehicle, "accident");
  const responder = m.dynamics!.responders!.find(
    (r) => r.vehicle === vehicle.id,
  )!;
  expect(responder.state).toBe("VERLETZT");
  expect(
    s.people.some((p) => p.id === responder.person && p.vehicle === vehicle.id),
  ).toBe(true);
  expect(m.dynamics!.patients.some((p) => p.id === responder.patient)).toBe(
    true,
  );
  expect(
    m.dynamics!.patients.find((p) => p.id === responder.patient)!.age,
  ).toBeGreaterThanOrEqual(18);
  expect(vt(vehicle.type).id).toBeTruthy();
});

it("verletzte Besatzung bleibt nach Reparatur unwirksam und wird erst nach Übergabe und Genesung wieder verfügbar", () => {
  const t = incidentVariants.find(
      (t) =>
        t.profile!.topic === "VU mit Verletzten" &&
        t.profile!.variant === "reported",
    )!,
    { s, m } = setup(t);
  const vehicle = s.vehicles.find((v) => vt(v.type).home === "ems")!;
  breakVehicle(s, vehicle, "accident");
  vehicle.fault!.state = "repaired";
  const responder = m.dynamics!.responders!.find(
    (r) => r.vehicle === vehicle.id,
  )!;
  const person = s.people.find((p) => p.id === responder.person)!,
    patient = m.dynamics!.patients.find((p) => p.id === responder.patient)!;
  expect(injuryReason(s, person)).toContain("verletzt");
  expect(personAvailable(s, person)).toContain("verletzt");
  expect(responseCrewAvailable(m, vehicle)).toBe(false);
  expect(effectiveSkills(m, vehicle)).toEqual({});
  m.phase = "done";
  m.completed = s.time;
  syncResponderRecovery(s, m);
  expect(injuryReason(s, person)).toContain("verletzt");
  patient.transport = "delivered";
  syncResponderRecovery(s, m);
  expect(injuryReason(s, person)).toContain("Genesung");
  expect(person.injury!.until).toBe(s.time + 900);
  const restored = validate(s);
  expect(restored.people.find((p) => p.id === person.id)!.injury).toEqual(
    person.injury,
  );
  s.time += 899;
  expect(injuryReason(s, person)).toContain("Genesung");
  s.time++;
  expect(injuryReason(s, person)).toBe("");
});
it("der Tod einer realen Einsatzkraft kann nicht durch Einsatzabschluss oder Zeitablauf zurückgesetzt werden", () => {
  const t = incidentVariants.find(
      (t) =>
        t.profile!.topic === "VU mit Verletzten" &&
        t.profile!.variant === "reported",
    )!,
    { s, m } = setup(t),
    vehicle = s.vehicles[0];
  breakVehicle(s, vehicle, "accident");
  const r = m.dynamics!.responders!.find((r) => r.vehicle === vehicle.id)!,
    person = s.people.find((p) => p.id === r.person)!;
  const patient = m.dynamics!.patients.find((p) => p.id === r.patient)!;
  patient.condition = "dead";
  patient.health = 0;
  syncResponderRecovery(s, m);
  expect(person.vehicle).toBeNull();
  s.time += 86400;
  expect(injuryReason(s, person)).toContain("verstorben");
});
