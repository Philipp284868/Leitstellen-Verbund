import { expect, it } from "vitest";
import { AudioEvents } from "../src/client/audio/events";
import { tick } from "../src/shared/engine";
import { fresh, validate } from "../src/shared/model";
import { alarm } from "../src/simulation/dispatch";
import { setFms } from "../src/simulation/fms";
import { afterVehicles, radioAction } from "../src/simulation/incidents";
import { advanceRadio, transmit } from "../src/simulation/transmissions";
import { phaseFixture } from "./dispatch-fixture";

function message(id: string, priority = 50, channel = "Feuerwehr") {
  return {
    id,
    priority,
    channel,
    sender: "Florian 1",
    vehicle: "unit",
    mission: "",
    text: "An der Einsatzstelle angekommen.",
  };
}
it("eine zum Meldebild entsandte Besatzung meldet auch unerwarteten technischen Bedarf statt ohne Erstlage festzuhängen", () => {
  const s = phaseFixture("unexpected-recon", "debris"),
    m = s.missions[0],
    v = s.vehicles[0];
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = "reported-technical";
  alarm(s, m, [v.id], s.player.id);
  tick(s, v.arrive + 10, {}, false, false);
  const reports = m.control!.radio.filter((r) => r.reason === "arrival");
  expect(reports).toHaveLength(1);
  radioAction(s, m, reports[0].id, "report", s.player.id);
  afterVehicles(s);
  expect(m.control!.briefed).toBe(true);
  expect(m.control!.radio.some((r) => r.reason === "request")).toBe(true);
  afterVehicles(s);
  expect(m.control!.radio.filter((r) => r.reason === "arrival")).toHaveLength(
    1,
  );
});
it("nur das erste geeignete Führungsfahrzeug meldet die Erstlage; weitere Ankünfte duplizieren sie nicht", () => {
  const s = phaseFixture("recon-owner");
  const m = s.missions[0];
  const [first, command] = s.vehicles;
  for (const v of [first, command]) {
    v.status = "scene";
    v.mission = m.id;
    v.assignment = v.id;
  }
  command.type = "elw";
  afterVehicles(s);
  expect(m.control!.firstArrival).toBe(command.id);
  expect(m.control!.radio.filter((r) => r.reason === "arrival")).toHaveLength(
    1,
  );
  afterVehicles(s);
  expect(m.control!.radio.filter((r) => r.reason === "arrival")).toHaveLength(
    1,
  );
});
it("ordnet FIFO je Kanal, lässt andere Leitstellen und FMS unabhängig und überlebt gespeicherte Zustände", () => {
  const s = phaseFixture("operator");
  s.radioNetwork = { version: 1, sequence: 0, entries: [] };
  transmit(s, message("first"));
  transmit(s, message("second"));
  transmit(s, message("ems", 50, "Rettungsdienst"));
  transmit(s, message("second"));
  expect(s.radioNetwork.entries.map((e) => e.state)).toEqual([
    "transmitting",
    "queued",
    "transmitting",
  ]);
  const other = fresh("Andere", "West", 0);
  transmit(other, message("independent"));
  expect(other.radioNetwork!.entries[0].state).toBe("transmitting");
  const unit = s.vehicles[0];
  setFms(s, unit, 2);
  unit.status = "travel";
  unit.mission = s.missions[0].id;
  unit.assignment = "radio-assignment";
  setFms(s, unit, 3);
  expect(s.desk.fleet[unit.id].code).toBe(3);
  expect(s.radioNetwork.entries.at(-1)!.state).toBe("queued");
  const loaded = validate(JSON.parse(JSON.stringify(s)));
  expect(loaded.radioNetwork).toEqual(s.radioNetwork);
  loaded.time = loaded.radioNetwork!.entries[0].ends!;
  advanceRadio(loaded);
  expect(loaded.radioNetwork!.entries[1].state).toBe("transmitting");
});
it("Notfall unterbricht kontrolliert, wiederholt die erhaltene Meldung und lässt normale Meldungen nicht verhungern", () => {
  const s = fresh("Test", "Nord", 0);
  transmit(s, message("normal"));
  transmit(s, message("emergency", 100));
  expect(s.radioNetwork!.entries[0]).toMatchObject({
    state: "queued",
    interrupted: true,
  });
  s.time = s.radioNetwork!.entries[1].ends!;
  advanceRadio(s);
  expect(s.radioNetwork!.entries[0]).toMatchObject({
    state: "transmitting",
    interrupted: true,
  });
  transmit(s, message("urgent-again", 100));
  expect(s.radioNetwork!.entries[0].state).toBe("transmitting");
  // No connected client acknowledgement is involved in advancing the channel.
  s.time += 65;
  advanceRadio(s);
  expect(s.radioNetwork!.entries[2].state).toBe("transmitting");
  transmit(s, message("waiting"));
  for (let i = 0; i < 20; i++) transmit(s, message(`urgent-${i}`, 80));
  s.time += 65;
  advanceRadio(s);
  expect(s.radioNetwork!.entries.find((e) => e.id === "waiting")!.state).toBe(
    "transmitting",
  );
});
it("großer Zeitsprung spielt keinen verpassten Stapel ab, behält ihn aber nachvollziehbar im Verlauf", () => {
  const s = fresh("Test", "Nord", 0);
  for (let i = 0; i < 20; i++) transmit(s, message(String(i)));
  s.time += 3600;
  advanceRadio(s);
  expect(
    s.radioNetwork!.entries.filter((e) => e.state === "transmitting"),
  ).toHaveLength(0);
  expect(
    s.radioNetwork!.entries.filter((e) => e.state === "missed"),
  ).toHaveLength(19);
  expect(s.radioNetwork!.entries[1].history.at(-1)!.reason).toContain(
    "erneut abrufbar",
  );
});
it("Live-Snapshots spielen nur neu begonnene Übertragungen; Reconnect, Offline, doppelte Revisionen bleiben stumm", () => {
  let s = fresh("Test", "Nord", 0);
  const events = new AudioEvents();
  advanceRadio(s);
  events.observeAll(s, "multi", true);
  s = structuredClone(s);
  s.revision++;
  transmit(s, message("first"));
  transmit(s, message("second"));
  expect(events.observeAll(s, "multi", true).map((e) => e.id)).toEqual([
    "first",
  ]);
  expect(events.observeAll(s, "multi", true)).toEqual([]);
  s = structuredClone(s);
  s.revision++;
  s.time += 10;
  advanceRadio(s);
  expect(events.observeAll(s, "multi", true).map((e) => e.id)).toEqual([
    "second",
  ]);
  events.observeAll(s, "multi", false);
  expect(events.observeAll(s, "multi", true)).toEqual([]);
  s = structuredClone(s);
  s.revision++;
  transmit(s, message("third"));
  s.time += 3600;
  advanceRadio(s);
  expect(events.observeAll(s, "multi", true)).toEqual([]);
});
