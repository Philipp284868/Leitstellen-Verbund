import { expect, it } from "vitest";
import { phaseFixture } from "./phase-fixture";
import { organizationFixture, addAmbulance } from "./phase-three-fixture";
import {
  civilProtectionCommand,
  civilProtectionTick,
} from "../src/simulation/civil-protection";
import { callAction, callsTick } from "../src/simulation/calls";
import { deskCommand } from "../src/simulation/commands";
import { publicSave } from "../src/simulation/incidents";
import { readiness, tick } from "../src/engine";
import { alarm, propose } from "../src/simulation/dispatch";
import { validate } from "../src/model";
import { commandSchema } from "../server/actions";

it("KatS-Bereitschaft lässt reguläre Alarmierung zu und beschleunigt professionelle Wachen nicht", () => {
  const s = organizationFixture("owner"),
    b = s.buildings[0],
    v = s.vehicles[0],
    m = s.missions[0];
  const money = s.money,
    people = structuredClone(s.people);
  civilProtectionCommand(
    s,
    { type: "civil-station", home: b.id, enabled: true, preparation: 60 },
    "owner",
  );
  expect(readiness(s, v)).toBe("");

  const aao = {
    ...s.desk.aaos[0],
    types: ["hlf"],
    org: "Alle" as const,
    skills: {},
    maxDistance: 1000,
  };
  propose(s, m, aao, "owner");
  expect(m.control!.proposal!.vehicles).toContain(v.id);
  civilProtectionCommand(
    s,
    { type: "civil-readiness", homes: [b.id], op: "mobilize" },
    "owner",
  );
  const readyAt = b.civilProtection!.readyAt;
  civilProtectionCommand(
    s,
    { type: "civil-readiness", homes: [b.id], op: "mobilize" },
    "owner",
  );
  expect(b.civilProtection!.readyAt).toBe(readyAt);
  s.time = readyAt;
  civilProtectionTick(s);
  civilProtectionTick(s);
  expect(b.civilProtection!.state).toBe("ready");
  expect(
    b.civilProtection!.history.filter((e) => e.actor === "server"),
  ).toHaveLength(1);
  expect(readiness(s, v)).toBe("");
  expect(s.people).toEqual(people);
  expect(s.money).toBe(money);
  alarm(s, m, [v.id], "owner");
  expect(v.status).toBe("alarmed");
  expect(v.depart - s.time).toBe(30);
  expect(() =>
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [b.id], op: "stand-down" },
      "owner",
    ),
  ).toThrow("Mindestlaufzeit");
  expect(() =>
    civilProtectionCommand(
      s,
      { type: "civil-station", home: b.id, enabled: false, preparation: 60 },
      "owner",
    ),
  ).toThrow("zuerst beenden");
});

it("Wachen werden gemeinsam validiert; Bereitschaft umgeht weder FMS 6 noch echte Besatzungssperren", () => {
  const s = organizationFixture("owner");
  addAmbulance(s);
  const [first, second] = s.buildings;
  civilProtectionCommand(
    s,
    { type: "civil-station", home: first.id, enabled: true, preparation: 60 },
    "owner",
  );
  const before = structuredClone(s);
  expect(() =>
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [first.id, "foreign"], op: "mobilize" },
      "owner",
    ),
  ).toThrow("Eigene");
  expect(s).toEqual(before);
  expect(() =>
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [first.id, first.id], op: "mobilize" },
      "owner",
    ),
  ).toThrow("einmal");
  expect(() =>
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [first.id, "foreign"], op: "mobilize" },
      "owner",
    ),
  ).toThrow("Eigene");
  civilProtectionCommand(
    s,
    { type: "civil-station", home: second.id, enabled: true, preparation: 120 },
    "owner",
  );
  civilProtectionCommand(
    s,
    {
      type: "civil-readiness",
      homes: s.buildings.map((b) => b.id),
      op: "mobilize",
    },
    "owner",
  );
  const next = validate(JSON.parse(JSON.stringify(s)));
  tick(next, next.time + 120, {}, false, false);
  expect(
    next.buildings.every((b) => b.civilProtection!.state === "ready"),
  ).toBe(true);
  const v = next.vehicles[0];
  next.desk.fleet[v.id].code = 6;
  expect(readiness(next, v)).toContain("FMS 6");
  next.desk.fleet[v.id].code = 2;
  next.people
    .filter((p) => p.vehicle === v.id)
    .forEach((p) => (p.training = "test"));
  expect(readiness(next, v)).toContain("Besatzung fehlt");
});

it("Bereitschaftsverlauf bleibt bei regulärer Rückumstellung erhalten und alte Stände behalten sämtliche Ressourcen", () => {
  const s = phaseFixture("owner");
  const old = validate(JSON.parse(JSON.stringify(s)));
  expect(old.buildings[0]).not.toHaveProperty("civilProtection");
  expect(old.vehicles).toEqual(s.vehicles);
  const home = s.buildings[0].id;
  civilProtectionCommand(
    s,
    { type: "civil-station", home, enabled: true, preparation: 60 },
    "owner",
  );
  civilProtectionCommand(
    s,
    { type: "civil-readiness", homes: [home], op: "mobilize" },
    "owner",
  );
  s.time += 600;
  civilProtectionTick(s);
  civilProtectionCommand(
    s,
    { type: "civil-readiness", homes: [home], op: "stand-down" },
    "owner",
  );
  civilProtectionCommand(
    s,
    { type: "civil-station", home, enabled: false, preparation: 60 },
    "owner",
  );
  const loaded = validate(JSON.parse(JSON.stringify(s)));
  expect(loaded.buildings[0].civilProtection!.history).toHaveLength(5);
  expect(readiness(loaded, loaded.vehicles[0])).toBe("");
  expect(loaded.money).toBe(old.money);
  expect(loaded.vehicles).toEqual(old.vehicles);
});

it("Notrufübergabe erhält Angaben, Dauer und Antwortsperre und erlaubt nur dem aktuellen Bearbeiter Änderungen", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  callAction(s, m, c.id, "accept", "owner");
  s.time += 10;
  callAction(s, m, c.id, "ask", "owner", "address");
  const nextAnswer = c.nextAnswer;
  const before = structuredClone(s);
  expect(() => callAction(s, m, c.id, "handoff", "other")).toThrow(
    "Gesprächsbearbeiter",
  );
  expect(s).toEqual(before);
  callAction(s, m, c.id, "handoff", "owner");
  expect(c.duration).toBe(10);
  expect(c.state).toBe("ringing");
  callAction(s, m, c.id, "accept", "member");
  expect(c.asked).toEqual(["address"]);
  expect(c.nextAnswer).toBe(nextAnswer);
  expect(() => callAction(s, m, c.id, "ask", "member", "report")).toThrow(
    "antwortet noch",
  );
  expect(() => callAction(s, m, c.id, "end", "owner")).toThrow(
    "Gesprächsbearbeiter",
  );
  s.time = nextAnswer;
  callAction(s, m, c.id, "ask", "member", "report");
  callAction(s, m, c.id, "end", "member");
  expect(c.duration).toBe(10 + nextAnswer - before.time);
  const view = publicSave(s).missions[0].control!;
  expect(view.secret).toBeUndefined();
  expect(
    view.events.some(
      (e) => e.type === "CALL_HANDED_OVER" && e.actor === "owner",
    ),
  ).toBe(true);
});

it("Übergabe verlängert den anstehenden Abbruch eines gestressten Anrufers nicht", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  c.stress = 90;
  callAction(s, m, c.id, "accept", "owner");
  const drop = m.control!.secret!.dropAt;
  s.time += 20;
  callAction(s, m, c.id, "handoff", "owner");
  callAction(s, m, c.id, "accept", "member");
  expect(m.control!.secret!.dropAt).toBe(drop);
  s.time = drop;
  callsTick(s);
  expect(c.state).toBe("dropped");
});

it("Lagenotizen brauchen ein Meldebild, werden öffentlich ohne versteckte Fakten gezeigt und überdauern Serialisierung", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    action = {
      type: "mission-note" as const,
      mission: m.id,
      text: "Zufahrt über die Nordseite freihalten.",
    };
  expect(() => deskCommand(s, action, "owner")).toThrow("Ort und Meldebild");
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = "reported-fire";
  m.control!.secret!.detail = "NICHT-ERKUNDETE-LAGE";
  deskCommand(s, action, "member");
  expect(JSON.stringify(publicSave(s))).not.toContain("NICHT-ERKUNDETE-LAGE");
  expect(publicSave(s).missions[0].control!.events.at(-1)?.text).toBe(
    action.text,
  );
  expect(
    validate(JSON.parse(JSON.stringify(s))).missions[0].control!.events.at(-1)
      ?.actor,
  ).toBe("member");
  expect(() =>
    commandSchema.parse({
      id: crypto.randomUUID(),
      action: { ...action, actor: "owner" },
    }),
  ).toThrow();
  expect(() =>
    commandSchema.parse({
      id: crypto.randomUUID(),
      action: { ...action, text: "x".repeat(601) },
    }),
  ).toThrow();
});

it("gleiche Zeitfolge und Aktionen ergeben identische Notruf-, Lagebuch- und Bereitschaftsdaten", () => {
  const base = phaseFixture("owner");
  const replay = () => {
    const s = structuredClone(base),
      m = s.missions[0],
      c = m.control!.calls[0],
      home = s.buildings[0].id;
    civilProtectionCommand(
      s,
      { type: "civil-station", home, enabled: true, preparation: 60 },
      "owner",
    );
    civilProtectionCommand(
      s,
      { type: "civil-readiness", homes: [home], op: "mobilize" },
      "owner",
    );
    callAction(s, m, c.id, "accept", "owner");
    callAction(s, m, c.id, "ask", "owner", "address");
    s.time += 5;
    callAction(s, m, c.id, "handoff", "owner");
    callAction(s, m, c.id, "accept", "member");
    callAction(s, m, c.id, "ask", "member", "report");
    deskCommand(
      s,
      { type: "mission-note", mission: m.id, text: "Zweite Zufahrt offen" },
      "member",
    );
    s.time += 60;
    civilProtectionTick(s);
    return validate(JSON.parse(JSON.stringify(s)));
  };
  expect(replay()).toEqual(replay());
});
