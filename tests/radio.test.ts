import { expect, it } from "vitest";
import { radioFixture } from "./radio-fixture";
import {
  afterStep,
  publicSave,
  radioAction,
  request,
} from "../src/simulation/incidents";
import {
  radioHandler,
  RADIO_LEASE_SECONDS,
} from "../src/simulation/radio-state";
import { validate } from "../src/shared/model";
import { tick } from "../src/shared/engine";

function setup() {
  const s = radioFixture("alpha"),
    m = s.missions[0],
    r = m.control!.radio[0];
  return {
    s,
    m,
    r,
    act: (op: Parameters<typeof radioAction>[3], actor = "alpha") =>
      radioAction(s, m, r.id, op, actor),
  };
}
it("reserviert atomar, lehnt fremde Bearbeitung unverändert ab und verlängert durch Wiederholung nicht", () => {
  const { s, m, r, act } = setup();
  act("claim");
  expect(r.handling).toEqual({
    actor: "alpha",
    until: s.time + RADIO_LEASE_SECONDS,
  });
  const before = structuredClone(s);
  act("claim");
  expect(s).toEqual(before);
  for (const op of [
    "claim",
    "release",
    "report",
    "question",
    "request",
    "close",
  ] as const) {
    expect(() => act(op, "bravo")).toThrow("anderen Disponenten");
    expect(s).toEqual(before);
  }
  expect(
    m.control!.events.filter((e) => e.type === "RADIO_CLAIMED"),
  ).toHaveLength(1);
});
it("gibt eine Reservierung frei und lässt sie genau am serverseitigen Ablaufzeitpunkt übernehmen", () => {
  const { s, r, act } = setup();
  act("claim");
  act("release");
  act("release");
  act("claim", "bravo");
  s.time = r.handling!.until - 1;
  expect(() => act("claim")).toThrow();
  s.time++;
  expect(radioHandler(r, s.time)).toBeUndefined();
  act("claim");
  expect(r.handling?.actor).toBe("alpha");
  expect(() => act("report", "bravo")).toThrow();
});
it("die Übernahme verrät keine Lage und umgeht die verpflichtende erste Lagemeldung nicht", () => {
  const { s, m, r, act } = setup();
  m.control!.secret!.detail = "VERBORGENE-WAHRHEIT";
  act("claim");
  for (const op of ["question", "request", "close"] as const)
    expect(() => act(op)).toThrow("erste Lagemeldung");
  const view = publicSave(s);
  expect(JSON.stringify(view)).not.toContain("VERBORGENE-WAHRHEIT");
  expect(view.missions[0].control!.radio[0].handling).toEqual(r.handling);
  expect(
    view.missions[0].control!.events.some((e) => e.type === "RADIO_CLAIMED"),
  ).toBe(true);
  act("report");
  expect(m.control!.briefed).toBe(true);
  expect(r.handledBy).toBe("alpha");
  expect(r.handling).toBeUndefined();
  expect(JSON.stringify(publicSave(s))).toContain("VERBORGENE-WAHRHEIT");
  const before = structuredClone(s);
  act("report", "bravo");
  expect(s).toEqual(before);
});
it("Rückfrage und Nachforderung nutzen den echten Kräftebedarf, bleiben nachvollziehbar und alarmieren nicht automatisch", () => {
  const { s, m, act } = setup();
  act("report");
  tick(s, s.time + 1, {}, false, false);
  const r = m.control!.radio.find(
    (r) => r.reason === "request" && r.state === "open",
  )!;
  expect(r).toBeDefined();
  radioAction(s, m, r.id, "claim", "bravo");
  radioAction(s, m, r.id, "question", "bravo");
  expect(r.answer).toContain("Löschwasser");
  expect(r.state).toBe("open");
  expect(r.handling?.actor).toBe("bravo");
  const before = structuredClone(s);
  radioAction(s, m, r.id, "question", "bravo");
  expect(s).toEqual(before);
  radioAction(s, m, r.id, "request", "bravo");
  expect(r.handledBy).toBe("bravo");
  expect(r.handling).toBeUndefined();
  expect(
    m.control!.events.some(
      (e) => e.type === "REINFORCEMENT_REQUESTED" && e.actor === "bravo",
    ),
  ).toBe(true);
  expect(s.vehicles[1].status).toBe("ready");
});
it("additive Felder lassen alte Spielstände unverändert lesbar und neue Reservierungen serialisierbar", () => {
  const { s, r, act } = setup();
  const old = validate(JSON.parse(JSON.stringify(s)));
  expect(old.missions[0].control!.radio[0]).not.toHaveProperty("handling");
  act("claim");
  expect(
    validate(JSON.parse(JSON.stringify(s))).missions[0].control!.radio[0]
      .handling,
  ).toEqual(r.handling);
  expect(old.money).toBe(s.money);
  expect(old.vehicles).toEqual(s.vehicles);
});
it("derselbe gespeicherte Stand und dieselbe Aktionsfolge ergeben exakt dieselben Funkdaten", () => {
  const { s } = setup();
  const replay = (copy: typeof s) => {
    const m = copy.missions[0],
      r = m.control!.radio[0];
    radioAction(copy, m, r.id, "claim", "alpha");
    copy.time += RADIO_LEASE_SECONDS;
    radioAction(copy, m, r.id, "claim", "bravo");
    radioAction(copy, m, r.id, "report", "bravo");
    return copy;
  };
  expect(replay(structuredClone(s))).toEqual(replay(structuredClone(s)));
});
it("der Einsatzabschluss beendet offene Reservierungen, der Funkverlauf bleibt im Archiv", () => {
  const { s, m, r, act } = setup();
  act("claim");
  request(s, m, r.vehicle, "question", "Weitere Rückfrage");
  s.missions = [];
  s.archive.push(m);
  m.phase = "done";
  afterStep(s);
  expect(
    m.control!.radio.every((r) => r.state === "handled" && !r.handling),
  ).toBe(true);
  expect(m.control!.events.some((e) => e.type === "RADIO_CLAIMED")).toBe(true);
});
