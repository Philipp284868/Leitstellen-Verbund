import { expect, it } from "vitest";
import { phaseFixture } from "./dispatch-fixture";
import { radioFixture } from "./radio-fixture";
import { AudioEvents } from "../src/client/audio/events";
import { projectEvents } from "../src/shared/game-events";
import { setFms } from "../src/simulation/fms";
import {
  afterVehicles,
  radioAction,
  publicSave,
} from "../src/simulation/incidents";
import { breakVehicle } from "../src/simulation/faults";
import { request, resolveRadioTopic } from "../src/simulation/radio-requests";
import {
  updateIncidentRadio,
  syncAssistanceRadio,
  migrateIncidentRadio,
} from "../src/simulation/incident-radio";
import { advanceRadio, transmit } from "../src/simulation/transmissions";
import { validate } from "../src/shared/model";

it("zeigt eigene Ausfälle bereits vor Erkundung, ohne verborgene Lagen oder einen zweiten Erstfunk preiszugeben", () => {
  const s = phaseFixture("fault-owner"),
    m = s.missions[0],
    v = s.vehicles[0];
  s.radioNetwork = { version: 1, sequence: 0, entries: [] };
  v.mission = m.id;
  v.status = "travel";
  breakVehicle(s, v, "engine");
  const visible = publicSave(s).missions[0];
  expect(visible.control!.radio).toHaveLength(1);
  expect(visible.control!.radio[0].details).toContain("Motorschaden");
  expect(visible.control!.radioSummary).toMatchObject({
    unresolved: true,
    notified: false,
  });
  expect(visible.control!.radioSummary!.text).toContain("Motorschaden");
  expect(visible.control!.secret).toBeUndefined();
  const fault = m.control!.radio[0];
  radioAction(s, m, fault.id, "question", s.player.id, {}, fault.version);
  expect(fault.answer).toContain("Motorschaden");
  expect(m.control!.briefed).toBe(false);
  const id = m.control!.radioSummary!.id;
  v.fault!.state = "repaired";
  v.status = "scene";
  afterVehicles(s);
  expect(m.control!.radioSummary).toMatchObject({ id, notified: true });
  expect(s.radioNetwork.entries.filter((e) => e.consolidated)).toHaveLength(1);
});

it("zwanzig Fahrzeuge erzeugen einen Erstfunk; Anliegen, FMS und Sprecherwechsel aktualisieren danach still", () => {
  const s = phaseFixture("radio-owner"),
    m = s.missions[0],
    c = m.control!;
  s.radioNetwork = { version: 1, sequence: 0, entries: [] };
  const audio = new AudioEvents();
  audio.observeAll(structuredClone(s), "multi", true);
  const cues: string[] = [];
  const snapshot = () => {
    s.revision++;
    cues.push(
      ...audio.observeAll(structuredClone(s), "multi", true).map((e) => e.id),
    );
  };
  const base = s.vehicles[0];
  for (let i = 0; i < 20; i++) {
    const v =
      i === 0
        ? base
        : {
            ...structuredClone(base),
            id: `unit-${i}`,
            name: `Florian ${i}`,
            arrive: s.time + i,
          };
    if (i) s.vehicles.push(v);
    v.mission = m.id;
    v.status = "scene";
    v.assignment = `arrival-${i}`;
    setFms(s, v, 4);
    afterVehicles(s);
    snapshot();
  }
  const id = c.radioSummary!.id;
  expect(cues.filter((cue) => cue === id)).toHaveLength(1);
  expect(s.radioNetwork.entries.filter((e) => e.consolidated)).toHaveLength(1);
  expect(c.radio.filter((r) => r.reason === "arrival")).toHaveLength(1);
  const first = c.radio.find((r) => r.reason === "arrival")!;
  radioAction(s, m, first.id, "report", s.player.id, {}, first.version);
  snapshot();
  for (let i = 0; i < 20; i++) {
    request(
      s,
      m,
      `unit-${i}`,
      "request",
      "Zusätzliche Löschwasserversorgung erforderlich.",
      "DRINGEND",
      "water-test",
    );
    snapshot();
  }
  expect(c.radio.filter((r) => r.topic === "water-test")).toHaveLength(1);
  request(
    s,
    m,
    base.id,
    "request",
    "Eine Person wird vermisst.",
    "NOTFALL",
    "person-test",
  );
  snapshot();
  expect(c.radioSummary).toMatchObject({ id, unresolved: true, priority: 100 });
  const before = cues.length;
  base.status = "return";
  base.mission = null;
  afterVehicles(s);
  snapshot();
  expect(c.radioSummary!.speaker).not.toBe(base.id);
  expect(c.radioSummary!.id).toBe(id);
  expect(cues).toHaveLength(before);
  expect(projectEvents(s).filter((e) => e.incidentRadio)).toHaveLength(1);
  expect(
    c.events.filter((e) => e.type === "FMS_CHANGED").length,
  ).toBeGreaterThanOrEqual(20);
  expect(c.radioSummary!.history.some((h) => h.text.includes("vermisst"))).toBe(
    true,
  );
});

it("eine veraltete Quittierung kann ein aktualisiertes Anliegen nicht schließen; getrennte Anliegen bleiben offen", () => {
  const s = radioFixture("owner"),
    m = s.missions[0],
    c = m.control!;
  const first = c.radio.find((r) => r.reason === "arrival")!;
  radioAction(s, m, first.id, "report", "owner", {}, first.version);
  request(
    s,
    m,
    s.vehicles[0].id,
    "request",
    "Eine weitere Pumpe nötig.",
    "DRINGEND",
    "pump",
  );
  request(
    s,
    m,
    s.vehicles[0].id,
    "request",
    "Eine Person eingeschlossen.",
    "NOTFALL",
    "person",
  );
  const pump = c.radio.find((r) => r.topic === "pump")!,
    version = pump.version!;
  request(
    s,
    m,
    s.vehicles[1].id,
    "request",
    "Zwei weitere Pumpen nötig.",
    "DRINGEND",
    "pump",
  );
  expect(() =>
    radioAction(s, m, pump.id, "close", "owner", {}, version),
  ).toThrow(/aktualisiert/);
  expect(pump.state).toBe("open");
  radioAction(s, m, pump.id, "close", "owner", {}, pump.version);
  expect(c.radio.find((r) => r.topic === "person")!.state).toBe("open");
  const revision = pump.version;
  request(
    s,
    m,
    s.vehicles[0].id,
    "request",
    "Zwei weitere Pumpen nötig.",
    "DRINGEND",
    "pump",
  );
  expect(pump.version).toBe(revision);
  resolveRadioTopic(s, m, "pump", "Pumpenbedarf gedeckt.");
  request(
    s,
    m,
    s.vehicles[0].id,
    "request",
    "Zwei weitere Pumpen nötig.",
    "DRINGEND",
    "pump",
  );
  expect(pump.state).toBe("open");
  expect(pump.version).toBeGreaterThan(revision!);
});

it("Queue-Rotation, Speicherstand, Funkrundenwechsel und Wiederverbindung wiederholen den Erstfunk nicht", () => {
  const s = radioFixture("owner"),
    m = s.missions[0],
    id = m.control!.radioSummary!.id;
  s.time += 60;
  advanceRadio(s);
  for (let i = 0; i < 2100; i++)
    transmit(s, {
      id: `external-${i}`,
      channel: "System",
      sender: "System",
      vehicle: "",
      mission: "",
      text: "Historischer Hinweis.",
      priority: 10,
      silent: true,
    });
  expect(s.radioNetwork!.entries.some((e) => e.id === id)).toBe(false);
  const resumed = validate(JSON.parse(JSON.stringify(s))),
    job = resumed.missions[0];
  job.round = "different-cooperation-round";
  request(
    resumed,
    job,
    resumed.vehicles[0].id,
    "request",
    "Neue Information nach Wiederverbindung.",
    "NOTFALL",
    "new-fact",
  );
  expect(job.control!.radioSummary!.id).toBe(id);
  const entry = resumed.radioNetwork!.entries.find((e) => e.id === id)!;
  expect(entry).toMatchObject({ silent: true, state: "delivered" });
  expect(new AudioEvents().observeAll(resumed, "multi", true)).toEqual([]);
});

it("berechtigte Helfer erhalten ihren Erstfunk einmal und spätere Änderungen einschließlich Abschluss still", () => {
  const owner = radioFixture("owner"),
    m = owner.missions[0],
    helper = phaseFixture("helper");
  helper.radioNetwork = { version: 1, sequence: 0, entries: [] };
  helper.vehicles[0].mission = `remote:owner:${m.id}`;
  helper.vehicles[0].status = "scene";
  const audio = new AudioEvents();
  audio.observeAll(structuredClone(helper), "multi", true);
  syncAssistanceRadio(owner, m, helper);
  helper.revision++;
  expect(
    audio
      .observeAll(structuredClone(helper), "multi", true)
      .filter((e) => e.radio === "Einsatzfunk"),
  ).toHaveLength(1);
  const id = helper.radioNetwork.entries[0].id;
  helper.time += 60;
  advanceRadio(helper);
  helper.radioNetwork.entries = [];
  syncAssistanceRadio(owner, m, helper);
  expect(helper.radioNetwork.entries[0]).toMatchObject({ id, silent: true });
  syncAssistanceRadio(owner, m, helper, false, false);
  expect(helper.radioNetwork.entries[0]).toMatchObject({
    unresolved: false,
    silent: true,
  });
  expect(helper.radioNetwork.entries[0].text).toContain(
    "Unterstützung beendet",
  );
  syncAssistanceRadio(owner, m, helper);
  expect(helper.radioNetwork.entries).toHaveLength(1);
  expect(helper.radioNetwork.entries[0].silent).toBe(true);
  helper.vehicles[0].mission = null;
  helper.vehicles[0].status = "return";
  for (const r of m.control!.radio) r.state = "handled";
  m.control!.briefed = true;
  updateIncidentRadio(owner, m);
  syncAssistanceRadio(owner, m, helper);
  expect(helper.radioNetwork.entries[0].unresolved).toBe(false);
  const outsider = phaseFixture("outsider");
  syncAssistanceRadio(owner, m, outsider);
  expect(outsider.radioNetwork?.entries.some((e) => e.consolidated)).not.toBe(
    true,
  );
});

it("alte aktive Funkanliegen werden ohne Replay zusammengeführt und behalten Aufgaben sowie vollständige Historie", () => {
  const s = radioFixture("owner"),
    m = s.missions[0];
  delete m.control!.radioSummary;
  for (const r of m.control!.radio) {
    delete r.version;
    delete r.topic;
    delete r.active;
  }
  s.radioNetwork = { version: 1, sequence: 0, entries: [] };
  transmit(s, {
    id: "old-request",
    channel: "Feuerwehr",
    sender: s.vehicles[0].name,
    vehicle: s.vehicles[0].id,
    mission: m.id,
    text: "Erste Meldung.",
    priority: 80,
  });
  const events = structuredClone(m.control!.events),
    requests = m.control!.radio.length;
  migrateIncidentRadio(s, m);
  expect(m.control!.radio).toHaveLength(requests);
  expect(m.control!.events).toEqual(events);
  expect(
    s.radioNetwork.entries.every((e) => e.silent && e.state === "delivered"),
  ).toBe(true);
  expect(
    s.radioNetwork.entries.find((e) => e.id === "old-request")!.supersededBy,
  ).toBe(m.control!.radioSummary!.id);
  const before = structuredClone(s);
  migrateIncidentRadio(s, m);
  expect(s).toEqual(before);
});
