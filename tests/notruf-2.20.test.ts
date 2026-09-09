import { describe, it, expect } from "vitest";
import { phaseFixture } from "./phase-fixture";
import { nextCallDelay } from "../src/simulation/balance";
import { callAction, questionsFor } from "../src/simulation/calls";
import { publicSave } from "../src/simulation/incidents";
import { missions } from "../src/catalog";
import {
  chooseIncidentTemplate,
  incidentCategory,
  exceptionalIncident,
} from "../src/simulation/incident-selection";
import {
  prepareCallPacing,
  mayCreateIncident,
  recordIncidentCreated,
  callLoad,
} from "../src/simulation/pacing";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { weatherWeight } from "../src/simulation/weather";
import { majorCommand } from "../src/simulation/major-command";

describe("Notruf 2.20: gemeldete Regressionen", () => {
  it("gewährt einer kleinen Startleitstelle mindestens fünf Minuten Abstand", () => {
    const s = phaseFixture("pacing", "bin");
    s.vehicles = s.vehicles.slice(0, 1);
    expect(nextCallDelay(123, s)).toBeGreaterThanOrEqual(300);
  });
  it("verlängert künftige Wartezeiten bei unerledigter Last", () => {
    const s = phaseFixture("pacing", "bin");
    const without = { ...s, missions: [] };
    expect(nextCallDelay(123, s)).toBeGreaterThan(nextCallDelay(123, without));
  });
  it("überträgt vor einer Erkundung keine internen Ereignisse oder Telemetrie", () => {
    const s = phaseFixture("knowledge", "flat"),
      m = s.missions[0];
    m.control!.events.push({
      id: "internal",
      at: s.time,
      type: "UNKNOWN_FUTURE_INTERNAL",
      text: "flat private hidden profile",
      actor: "server",
      vehicle: "",
    });
    const view = publicSave(s).missions[0];
    expect(view.template).toBe("incoming");
    expect(view.telemetry).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("UNKNOWN_FUTURE_INTERNAL");
    expect(questionsFor(view)).toEqual(
      questionsFor({ ...view, template: "sick" }),
    );
  });
  it("liefert nach der Meldebildfrage Beobachtungen statt fertiger interner Vorlage", () => {
    const s = phaseFixture("knowledge", "car"),
      m = s.missions[0],
      call = m.control!.calls[0];
    callAction(s, m, call.id, "accept", s.player.id);
    callAction(s, m, call.id, "ask", s.player.id, "report");
    expect(m.control!.reportedTemplate).toBe("reported-fire");
    expect(publicSave(s).missions[0].template).toBe("reported-fire");
    expect(m.control!.facts.at(-1)!.text).not.toBe("Mülleimerbrand");
  });
  it("entfernt alte verborgene Vorlagentitel aus künftigen Antworten, erhält aber bereits erfragte Fakten", () => {
    const s = phaseFixture("old-call", "car"),
      m = s.missions[0],
      c = m.control!,
      call = c.calls[0];
    c.secret!.report = "bin";
    c.secret!.observations![0] = "Mülleimerbrand; interne alte Vorlage";
    c.facts.push({
      key: "people",
      text: "Bereits erfragt",
      source: call.id,
      confidence: "unbestätigt",
    });
    call.quality = 90;
    callAction(s, m, call.id, "accept", s.player.id);
    callAction(s, m, call.id, "ask", s.player.id, "report");
    s.time = call.nextAnswer;
    callAction(s, m, call.id, "ask", s.player.id, "detail");
    expect(c.facts[0].text).toBe("Bereits erfragt");
    expect(c.reportedTemplate).toBe("reported-fire");
    expect(JSON.stringify(publicSave(s))).not.toContain("interne alte Vorlage");
    expect(c.facts.at(-1)!.text).toContain("Rauch an einem Fahrzeug");
  });
  it("erhält bewusst gesetzte Disponentenpriorität vor Alarmierung, verbirgt aber automatische unbekannte Priorität", () => {
    const s = phaseFixture("priority", "sick"),
      m = s.missions[0];
    m.control!.locationKnown = true;
    m.control!.reportedTemplate = "reported-medical";
    m.control!.priority = "NOTFALL";
    expect(publicSave(s).missions[0].control!.priority).toBe("NORMAL");
    majorCommand(
      s,
      { type: "mission-priority", mission: m.id, priority: "KRITISCH" },
      s.player.id,
    );
    const view = publicSave(s).missions[0];
    expect(view.control!.priority).toBe("KRITISCH");
    expect(
      view.control!.events.find((e) => e.type === "DISPATCH_PRIORITY")?.text,
    ).toContain("KRITISCH");
    expect(view.telemetry).toBeUndefined();
    expect(view.template).toBe("reported-medical");
  });
});

describe("Notruflast und Reproduzierbarkeit", () => {
  it("erhält Frist und vorhandene Einsätze bei Migration, Überlast und Wiederverbindung", () => {
    const s = phaseFixture("pacing", "bin");
    s.vehicles = s.vehicles.slice(0, 1);
    const original = structuredClone(s.missions);
    s.missionWait = 0;
    prepareCallPacing(s, 0);
    const persisted = structuredClone(s.callPacing);
    for (let n = 0; n < 20; n++) prepareCallPacing(s, 0);
    expect(s.callPacing).toEqual(persisted);
    expect(s.missions).toEqual(original);
    s.time = s.callPacing!.notBefore;
    prepareCallPacing(s, 1);
    expect(mayCreateIncident(s)).toBe(false);
    s.missions = [];
    expect(mayCreateIncident(s)).toBe(true);
    recordIncidentCreated(s);
    expect(s.callPacing!.notBefore - s.time).toBeGreaterThanOrEqual(300);
    const before = s.callPacing!.sequence;
    s.time += 14400;
    prepareCallPacing(s, 14400);
    expect(mayCreateIncident(s)).toBe(false);
    expect(s.callPacing!.sequence).toBe(before);
    expect(s.missionWait).toBeGreaterThanOrEqual(300);
  });
  it("skaliert mit vorhandener einsatzfähiger Struktur ohne Levelsprung und zählt gebundene Mittel", () => {
    const s = phaseFixture("pacing", "bin");
    s.missions = [];
    const before = nextCallDelay(124, s);
    s.xp += 10000;
    expect(nextCallDelay(124, s)).toBe(before);
    s.vehicles[0].status = "scene";
    expect(callLoad(s).busy).toBe(0.5);
    expect(nextCallDelay(124, s)).toBeGreaterThan(before);
  });
  it("erzeugt nur einmal je Leitstelle, nie in ruhenden Mitgliedersaves und nie als Nachholstapel", () => {
    const db = new Database(mkdtempSync(resolve(tmpdir(), "lv-call-desk-")));
    try {
      for (const id of ["owner", "member"]) {
        const s = phaseFixture(id, "bin");
        s.missions = [];
        s.archive = [];
        s.missionWait = 0;
        db.sql
          .prepare(
            "INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)",
          )
          .run(id, id, "unused", "player", 0);
        db.save(id, s);
      }
      db.sql
        .prepare("INSERT INTO desk_members VALUES (?,?)")
        .run("member", "owner");
      const game = new Game(db);
      game.step(1);
      expect(db.all().get("owner")!.missions).toHaveLength(0);
      const deadline = db.all().get("owner")!.callPacing!.notBefore;
      for (let i = 0; i < 10; i++) {
        game.view("owner", new Set(["owner", "member"]));
        game.view("member", new Set(["owner", "member"]));
        game.step(60);
      }
      const active = db.all().get("owner")!;
      expect(active.missions).toHaveLength(1);
      expect(active.missions[0].created).toBeGreaterThanOrEqual(deadline);
      expect(db.all().get("member")!.missions).toHaveLength(0);
      expect(game.view("member", new Set()).save.missions).toEqual(
        game.view("owner", new Set()).save.missions,
      );
      game.step(14400);
      expect(db.all().get("owner")!.missions).toHaveLength(1);
      expect(db.all().get("owner")!.missionWait).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});

it("gewichtet 10000 reproduzierbare Ziehungen zuerst nach Kategorie und hält Großlagen selten", () => {
  const s = phaseFixture("mix", "bin");
  s.time = 43200;
  const counts: Record<string, number> = {},
    before: Record<string, number> = {};
  let rare = 0;
  const weighted = missions.flatMap((t) =>
    Array.from({ length: weatherWeight(s, t.id) }, () => t),
  );
  for (let n = 0; n < 10000; n++) {
    s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
    const t = chooseIncidentTemplate(s, missions);
    const k = incidentCategory(t);
    counts[k] = (counts[k] || 0) + 1;
    rare += Number(exceptionalIncident(t));
    const prior = incidentCategory(weighted[(s.seed >>> 16) % weighted.length]);
    before[prior] = (before[prior] || 0) + 1;
  }
  expect(counts.technical).toBeGreaterThan(counts.fire * 2);
  expect(counts.medical).toBeGreaterThan(1000);
  expect(counts.police).toBeGreaterThan(100);
  expect(counts.water).toBeGreaterThan(50);
  expect(rare).toBeLessThan(160);
  if (process.env.LV_CALL_MIX_OUT)
    writeFileSync(
      resolve(process.env.LV_CALL_MIX_OUT),
      JSON.stringify(
        { samples: 10000, before, after: counts, exceptional: rare },
        null,
        2,
      ),
    );
}, 60000);

it("mehr Brandvorlagen ändern bei identischen Ziehungen die Grundkategorie nicht", () => {
  const s = phaseFixture("mix", "bin");
  const ordinary = missions.filter((t) => !exceptionalIncident(t));
  const base = [
    ...new Map(ordinary.map((t) => [incidentCategory(t), t])).values(),
  ];
  const moreFire = [
    ...base,
    ...ordinary.filter((t) => incidentCategory(t) === "fire"),
  ];
  for (let seed = 1; seed <= 2000; seed++) {
    s.seed = seed;
    expect(incidentCategory(chooseIncidentTemplate(s, moreFire))).toBe(
      incidentCategory(chooseIncidentTemplate(s, base)),
    );
  }
}, 30000);
