import { expect, it } from "vitest";
import { validate } from "../src/model";
import { availableQuestions, callAction } from "../src/simulation/calls";
import { alarm } from "../src/simulation/dispatch";
import { publicSave } from "../src/simulation/incidents";
import { phaseFixture } from "./dispatch-fixture";

it("fragt adaptiv, disponiert während des Gesprächs und erhält Quellen nach Wiederholung und Reload", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  c.stress = 40;
  expect(availableQuestions(publicSave(s).missions[0], c)).toEqual([
    "address",
    "report",
    "callback",
  ]);
  callAction(s, m, c.id, "accept", "owner");
  callAction(s, m, c.id, "ask", "owner", "callback");
  expect(m.control!.facts[0].text).not.toMatch(/\+49|[0-9]{5}/);
  s.time = c.nextAnswer;
  callAction(s, m, c.id, "ask", "owner", "address");
  expect(availableQuestions(publicSave(s).missions[0], c)).toContain("access");
  expect(availableQuestions(publicSave(s).missions[0], c)).not.toContain(
    "address",
  );
  s.time = c.nextAnswer;
  callAction(s, m, c.id, "ask", "owner", "report");
  alarm(s, m, [s.vehicles[0].id], "owner");
  expect(c.state).toBe("active");
  expect(s.vehicles[0].status).toBe("alarmed");
  expect(s.desk.fleet[s.vehicles[0].id].code).not.toBe(3);
  s.time = c.nextAnswer;
  callAction(s, m, c.id, "ask", "owner", "access");
  const facts = structuredClone(m.control!.facts);
  callAction(s, m, c.id, "ask", "owner", "access");
  expect(m.control!.facts).toEqual(facts);
  expect(validate(s).missions[0].control!.facts).toEqual(facts);
  expect(JSON.stringify(publicSave(s))).not.toContain('"secret"');
});

it("bewahrt bei Übergabe bekannte Angaben, beantwortet Ergänzungen und schützt fremde Bearbeitung", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  callAction(s, m, c.id, "accept", "owner");
  callAction(s, m, c.id, "ask", "owner", "report");
  callAction(s, m, c.id, "handoff", "owner");
  callAction(s, m, c.id, "accept", "member");
  expect(() => callAction(s, m, c.id, "ask", "member", "people")).toThrow(
    "antwortet",
  );
  s.time = c.nextAnswer;
  expect(() => callAction(s, m, c.id, "ask", "owner", "people")).toThrow(
    "Gesprächsbearbeiter",
  );
  callAction(s, m, c.id, "ask", "member", "people");
  expect(m.control!.facts.map((f) => f.key)).toEqual(["report", "people"]);
  expect(m.control!.facts.every((f) => f.source === c.id)).toBe(true);
});
