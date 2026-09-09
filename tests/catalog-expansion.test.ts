import { describe, it, expect } from "vitest";
import {
  missions,
  vehicles,
  capabilities,
  vt,
  mt,
  type Template,
} from "../src/catalog";
import { incidentTopics } from "../src/catalog/incident-topics";
import { incidentVariants } from "../src/catalog/incident-variants";
import {
  incidentProfileSchema,
  incidentSiteKind,
} from "../src/catalog/incident-profile";
import { fresh, validate, type Mission, type Vehicle } from "../src/model";
import { attachIncident } from "../src/simulation/calls";
import {
  attachDynamics,
  dynamicsTick,
  dynamicsComplete,
  followupsTick,
} from "../src/simulation/dynamics";
import { attachOrganizations } from "../src/simulation/organizations";
import { requirements } from "../src/simulation/hazards";
import { weatherWeight, environmentAt } from "../src/simulation/weather";
import { declareMajor, majorKind } from "../src/simulation/major-incidents";
import {
  patientTransportReason,
  patientTick,
} from "../src/simulation/patients";
import {
  incidentQuality,
  qualityFactor,
  reportUnit,
} from "../src/simulation/reports";
import { record } from "../src/simulation/events";
import { nodes } from "../src/world";
import { publicSave } from "../src/simulation/incidents";
import { breakVehicle } from "../src/simulation/faults";
import { phaseFixture } from "./phase-fixture";

function incident(t: Template, seed = 100) {
  const s = fresh("Audit", "Katalogprüfung", Date.UTC(2026, 5, 15, 12) / 1000);
  s.generation = "11111111-2222-4333-8444-555555555555";
  s.seed = seed;
  const m: Mission = {
    id: "incident",
    template: t.id,
    pos: nodes[2],
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
  s.environment = {
    ...environmentAt(s.time),
    kind: "cloud",
    rain: 0,
    wind: 0,
    visibility: 15000,
    density: 0,
    roads: [],
  };
  return { s, m };
}
const find = (text: string, variant = "reported") =>
  incidentVariants.find(
    (t) => t.profile?.topic === text && t.profile.variant === variant,
  )!;

describe("Vollständiger fachlicher Einsatzkatalog", () => {
  it("misst Fahrzeugbindung bis zur tatsächlichen Freigabe und bewahrt mehr als 500 dokumentierte Einheiten", () => {
    const { s, m } = incident(find("Mülleimerbrand"));
    const start = s.time;
    const v = { id: "v", type: "tsf", name: "TSF", status: "scene" } as Vehicle;
    reportUnit(s, m, v);
    record(s, m, "ALARM_STARTED", "Alarm", "server", v.id);
    s.time = start + 300;
    record(s, m, "VEHICLE_RELEASED", "Freigegeben", "server", v.id);
    s.time = start + 600;
    record(s, m, "ALARM_STARTED", "Erneut alarmiert", "server", v.id);
    s.time = start + 780;
    record(s, m, "VEHICLE_RELEASED", "Freigegeben", "server", v.id);
    m.completed = start + 3600;
    m.phase = "done";
    expect(incidentQuality(m).unitMinutes).toBe(8);
    for (let i = 0; i < 501; i++) reportUnit(s, m, { ...v, id: `v-${i}` });
    expect(validate(s).missions[0].telemetry!.units).toHaveLength(502);
  });
  it("speichert eine neu entstandene Explosionsgefahr zusätzlich zu einem vollen Anfangsprofil", () => {
    const { s, m } = incident(find("Industriebrand")),
      d = m.dynamics!;
    d.hazards.find((h) => h.kind === "fire")!.value = 100;
    while (d.hazards.length < 15) d.hazards.push({ ...d.hazards[0] });
    d.nextEvent = s.time + 5;
    s.time += 5;
    dynamicsTick(s, m);
    expect(d.events).toContain("explosion");
    expect(d.hazards).toHaveLength(16);
    expect(
      m.control!.events.some(
        (e) =>
          e.type === "HAZARD_CREATED" && e.text.includes("Explosionsfolge"),
      ),
    ).toBe(true);
    expect(validate(s).missions[0].dynamics!.hazards).toHaveLength(16);
  });
  it("protokolliert Gefahren und Patientenzustandsübergänge einmalig statt pro Tick", () => {
    const { s, m } = incident(find("Reanimation"));
    const count = (type: string) =>
      m.control!.events.filter((e) => e.type === type).length;
    const initialHazards = m.dynamics!.hazards.length;
    expect(count("HAZARD_CREATED")).toBe(initialHazards);
    expect(count("PATIENT_CREATED")).toBe(m.dynamics!.patients.length);
    attachDynamics(s, m);
    expect(count("HAZARD_CREATED")).toBe(initialHazards);
    const p = m.dynamics!.patients[0];
    p.health = 65.1;
    p.condition = "stable";
    patientTick(s, m, {}, 10);
    expect(count("PATIENT_DETERIORATION")).toBe(1);
    patientTick(s, m, {}, 1);
    expect(count("PATIENT_DETERIORATION")).toBe(1);
    p.health = 10;
    p.condition = "cpr";
    p.cprCycles = 3;
    p.nextCpr = s.time;
    patientTick(s, m, {}, 1);
    expect(count("PATIENT_DEAD")).toBe(1);
    patientTick(s, m, {}, 5);
    expect(count("PATIENT_DEAD")).toBe(1);
    const fire = incident(find("Mülleimerbrand"));
    fire.m.dynamics!.hazards.forEach((h) => {
      h.value = 100;
      h.threshold = 75;
    });
    fire.m.dynamics!.nextEvent = fire.s.time + 5;
    fire.s.time += 5;
    dynamicsTick(fire.s, fire.m, {}, {});
    expect(
      fire.m.control!.events.filter((e) => e.type === "HAZARD_ESCALATED"),
    ).toHaveLength(1);
    fire.s.time += 10;
    dynamicsTick(fire.s, fire.m, {}, {});
    expect(
      fire.m.control!.events.filter((e) => e.type === "HAZARD_ESCALATED"),
    ).toHaveLength(1);
  });
  it("deckt alle 206 Auftragsthemen ab, bewahrt die 41 alten IDs und erzeugt über 500 echte Situationen", () => {
    expect(incidentTopics).toHaveLength(206);
    expect(incidentVariants.length).toBeGreaterThan(500);
    expect(missions).toHaveLength(41 + incidentVariants.length);
    expect(new Set(missions.map((t) => t.id)).size).toBe(missions.length);
    for (const row of incidentTopics)
      for (const variant of ["reported", "access", "extended"])
        expect(
          incidentVariants.some((t) => t.id === `case-${row.id}-${variant}`),
          row.name,
        ).toBe(true);
    expect(mt("bin").name).toBe("Müllbehälterbrand");
    expect(mt("heart").id).toBe("heart");
    expect(
      [3, 4, 5, 6, 7, 8, 9, 10].map(
        (n) => incidentTopics.filter((t) => t.section === n).length,
      ),
    ).toEqual([55, 29, 21, 16, 18, 33, 24, 10]);
  });
  it("hinterlegt echte Profilunterschiede statt nur andere Namen", () => {
    for (const topic of new Map(
      incidentTopics.map((t) => [t.id, t]),
    ).values()) {
      const variants = incidentVariants.filter((t) =>
        ["reported", "access", "extended"].some(
          (variant) => t.id === `case-${topic.id}-${variant}`,
        ),
      );
      const effects = variants.map((t) =>
        JSON.stringify({
          r: t.requirements,
          seconds: t.seconds,
          patient: t.profile!.patient,
          hazards: t.profile!.hazards,
          fire: t.profile!.fire,
        }),
      );
      expect(new Set(effects).size, topic.name).toBe(3);
    }
  });
  it("validiert jedes persistierte Profil und jede Anforderung einschließlich Organisationsaufgaben", () => {
    for (const t of incidentVariants) {
      expect(() => incidentProfileSchema.parse(t.profile), t.id).not.toThrow();
      const { m } = incident(t);
      for (const [skill, n] of Object.entries(requirements(m))) {
        expect(capabilities[skill], `${t.id}/${skill}`).toBeTruthy();
        expect(
          vehicles.some((v) => (v.skills[skill] || 0) > 0),
          `${t.id}/${skill} ${n}`,
        ).toBe(true);
      }
      expect(m.dynamics!.hazards.length).toBeLessThanOrEqual(15);
    }
  });
  it("alle Situationen lassen sich mit ihren tatsächlich benötigten Kräften stabilisieren", () => {
    for (const t of incidentVariants) {
      const { s, m } = incident(t);
      m.control!.briefed = true;
      m.organization!.tasks.forEach((task) => (task.ordered = true));
      const supplied = Object.fromEntries(
        Object.entries(requirements(m)).map(([k, n]) => [k, Math.max(n, 10)]),
      );
      for (let i = 0; i < 180 && !dynamicsComplete(m, s.time); i++) {
        s.time += 5;
        dynamicsTick(s, m, supplied);
      }
      expect(
        dynamicsComplete(m, s.time),
        `${t.id}: ${JSON.stringify(m.dynamics!.hazards.filter((h) => !h.resolved))}`,
      ).toBe(true);
    }
  }, 30000);
  it("bewahrt Profile bytegleich beim Wiederanbinden und stellt keine unerkannten Befunde öffentlich bereit", () => {
    const { s, m } = incident(find("Reanimation", "extended"));
    const snapshot = JSON.stringify(m.dynamics!.scenario);
    attachDynamics(s, m);
    expect(JSON.stringify(m.dynamics!.scenario)).toBe(snapshot);
    expect(publicSave(s).missions[0].dynamics).toBeUndefined();
    m.control!.briefed = true;
    const copy = validate(s);
    expect(copy.missions[0].dynamics!.scenario).toEqual(m.dynamics!.scenario);
    expect(publicSave(s).missions[0].dynamics).not.toHaveProperty("random");
  });
  it("nutzt passende Patientenbefunde für Reanimation, Säuglinge, Blutung und Temperatur", () => {
    const patient = (name: string) =>
      incident(find(name)).m.dynamics!.patients[0];
    expect(patient("Reanimation").condition).toBe("cpr");
    expect(patient("Reanimation").pulse).toBe(0);
    expect(patient("Säuglingsnotfall").age).toBe(0);
    expect(patient("schwere Blutung").bloodLoss).toBeGreaterThan(20);
    expect(patient("Unterkühlung").temperature).toBeLessThan(35);
    expect(patient("Überhitzung").temperature).toBeGreaterThan(39);
  });
  it("unterscheidet reale Brennstoffe und Ausdehnung", () => {
    expect(incident(find("Papiercontainerbrand")).m.dynamics!.fire!.fuel).toBe(
      "Papier",
    );
    expect(incident(find("Reifenlagerbrand")).m.dynamics!.fire!.fuel).toBe(
      "Reifen",
    );
    expect(incident(find("Waldbrand")).m.dynamics!.fire!.area).toBeGreaterThan(
      incident(find("Mülleimerbrand")).m.dynamics!.fire!.area,
    );
  });
  it("ordnet Wasserlagen nur bestätigten Zugängen zu und kennzeichnet Bootsbedarf ausdrücklich", () => {
    for (const t of incidentVariants.filter((t) => t.profile!.site === "water"))
      expect(incidentSiteKind(t.profile)).toBe("shoreaccess");
    const boat = find("gekentertes Boot");
    expect(boat.water).toBe(true);
    expect(boat.requirements.boat).toBeGreaterThan(0);
  });
  it("gewichtet Wetter, Berufsverkehr, Schule, Nacht und Jahreszeit tatsächlich", () => {
    const { s } = incident(find("Baum auf Straße"));
    const tree = find("Baum auf Straße").id,
      heat = find("Überhitzung").id,
      traffic = find("VU mit Verletzten").id;
    const baseline = weatherWeight(s, tree);
    s.environment!.kind = "gale";
    expect(weatherWeight(s, tree)).toBeGreaterThan(baseline);
    s.environment!.kind = "cloud";
    s.time = Date.UTC(2026, 0, 15, 12) / 1000;
    const winter = weatherWeight(s, heat);
    s.time = Date.UTC(2026, 6, 15, 12) / 1000;
    expect(weatherWeight(s, heat)).toBeGreaterThan(winter);
    const noon = weatherWeight(s, traffic);
    s.time = Date.UTC(2026, 6, 15, 8) / 1000;
    expect(weatherWeight(s, traffic)).toBeGreaterThan(noon);
  });
  it("erzeugt MANV mit realen Abschnitten und patientenbezogenen Anforderungen", () => {
    const { s, m } = incident(find("MANV"));
    expect(majorKind(m)).toBe("manv");
    declareMajor(s, m);
    expect(m.major!.sections.some((x) => x.kind === "medical")).toBe(true);
    expect(m.dynamics!.patients.length).toBeGreaterThanOrEqual(5);
    expect(requirements(m).medicalCommand).toBeGreaterThan(0);
  });
  it("erzeugt kausale Folgeeinsätze auch bei bereits über 60 offenen Einsätzen", () => {
    const { s, m } = incident(find("Baum auf Straße"));
    // This case tests pacing with a developed fleet; missing equipment is covered separately.
    const fleet = phaseFixture("catalog-followup");
    s.player.id = fleet.player.id;
    s.buildings = fleet.buildings;
    s.xp = fleet.xp;
    s.vehicles = fleet.vehicles;
    m.dynamics!.pending = { template: "crash", due: s.time };
    s.vehicles.push({ ...s.vehicles[0], id: "ambulance", type: "rtw" });
    s.vehicles.push({ ...s.vehicles[0], id: "patrol", type: "fustw" });
    s.missionWait = 0;
    for (let n = 0; n < 70; n++)
      s.missions.push({
        ...structuredClone(m),
        id: `open-${n}`,
        dynamics: undefined,
      });
    followupsTick(s);
    expect(s.missions).toHaveLength(72);
    const child = s.missions.at(-1)!;
    expect(child.template).toBe("crash");
    expect(child.dynamics!.parent).toBe(m.id);
  });
  it("wiederholt die neue Simulation nach Speichern deterministisch", () => {
    const { s, m } = incident(find("Kellerbrand", "extended"), 871),
      restored = structuredClone(s);
    for (let i = 0; i < 90; i++) {
      s.time += 5;
      dynamicsTick(s, m);
      restored.time += 5;
      dynamicsTick(restored, restored.missions[0]);
    }
    expect(restored).toEqual(s);
  });
});

describe("Spezialfahrzeuge und Bewertung", () => {
  it("ergänzt FW/RD bei unverändertem Polizei-/THW-Fahrzeugset und echten Fähigkeiten", () => {
    expect(
      vehicles.filter((v) => v.home === "police").map((v) => v.id),
    ).toEqual(["fustw", "pmtw"]);
    expect(vehicles.filter((v) => v.home === "thw").map((v) => v.id)).toEqual([
      "gkw",
      "mzgw",
      "tmtw",
    ]);
    for (const id of [
      "lf10",
      "hlf10",
      "tlf2000",
      "tlf3000",
      "elw2",
      "kdow",
      "vrw",
      "gwl",
      "gwmess",
      "gwt",
      "abruest",
      "abwasser",
      "abschaum",
      "abatem",
      "abgefahrgut",
      "sw",
      "dekonp",
      "grtw",
      "naw",
      "itw",
      "ith",
      "rtwxl",
      "ktwb",
      "mzf",
      "elrd",
      "orgl",
      "lna",
      "segrtw",
      "gwsan",
      "segbetreuung",
    ]) {
      const t = vt(id);
      expect(t.level).toBeGreaterThan(1);
      expect(Object.values(t.skills).some((n) => n > 0)).toBe(true);
    }
    expect(vt("tsf").crewMinimum).toBe(4);
    expect(vt("hlf").crewMinimum).toBe(6);
    expect(vt("grtw").capacity).toBe(6);
    expect(vt("ktwb").capacity).toBe(2);
    expect(
      vehicles
        .filter((v) => v.id.startsWith("ab"))
        .every((v) => v.name.startsWith("WLF mit ") && v.mode === "road"),
    ).toBe(true);
  });
  it("verhindert ungeeigneten Intensivtransport durch ein normales Rettungsmittel", () => {
    const { m } = incident(find("Reanimation", "extended"));
    expect(patientTransportReason(m, { type: "rtw" } as Vehicle)).toContain(
      "ITW",
    );
    expect(patientTransportReason(m, { type: "itw" } as Vehicle)).toBe("");
    expect(patientTransportReason(m, { type: "ith" } as Vehicle)).toBe("");
  });
  it("hält Planfahrzeiten fest und bewertet lange pünktliche Deutschlandfahrten fair", () => {
    const rating = (seconds: number) => {
      const { s, m } = incident(find("Mülleimerbrand"));
      m.control!.briefed = true;
      const v = {
        id: "vehicle",
        type: "tsf",
        name: "TSF",
        status: "alarmed",
        depart: s.time + 120,
        journey: { plannedSeconds: seconds },
      } as Vehicle;
      const u = reportUnit(s, m, v)!;
      expect(u.plannedSeconds).toBe(seconds);
      record(s, m, "CALL_ACCEPTED", "Angenommen");
      record(s, m, "ALARM_STARTED", "Alarm", "server", v.id);
      s.time += 120;
      record(s, m, "VEHICLE_DEPARTED", "Ausgerückt", "server", v.id);
      s.time += seconds;
      record(s, m, "VEHICLE_ARRIVED", "Vor Ort", "server", v.id);
      m.completed = s.time + 120;
      m.phase = "done";
      return incidentQuality(m);
    };
    expect(rating(180).score).toBe(rating(3600).score);
    expect(rating(3600).travelRatio).toBe(1);
  });
  it("verwendet tatsächliche Eskalationen statt anfänglicher Alarmstufe und erzeugt keine XP-Bonusfarm", () => {
    const { s, m } = incident(find("Waldbrand", "extended"));
    m.control!.briefed = true;
    declareMajor(s, m);
    const baseline = qualityFactor(m);
    expect(incidentQuality(m).escalations).toBe(0);
    record(s, m, "MISSION_ESCALATED", "Lage verschlechtert");
    expect(qualityFactor(m)).toBeLessThan(baseline);
    expect(qualityFactor(m)).toBeLessThanOrEqual(1);
  });
  it("ein Unfall auf Anfahrt immobilisiert am realen Fahrzeugort ohne Patiententeleport", () => {
    const { s, m } = incident(find("Mülleimerbrand"));
    const v = {
      id: "v",
      name: "TSF",
      type: "tsf",
      status: "travel",
      mission: m.id,
      assignment: "a",
      path: [nodes[0], nodes[2]],
      depart: s.time,
      arrive: s.time + 100,
      patients: 0,
    } as Vehicle;
    s.vehicles = [v];
    const count = m.dynamics!.patients.length;
    breakVehicle(s, v, "accident");
    expect(v.fault!.kind).toBe("accident");
    expect(v.fault!.position).toEqual(nodes[0]);
    expect(m.dynamics!.patients).toHaveLength(count);
  });
});
