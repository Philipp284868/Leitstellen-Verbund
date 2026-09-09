import { it, expect } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { majorFixture, atScene } from "./phase-four-fixture";
import {
  declareMajor,
  majorTick,
  campaignTick,
  maybeMajor,
} from "../src/simulation/major-incidents";
import { majorCommand } from "../src/simulation/major-command";
import {
  effectiveSkills,
  majorComplete,
} from "../src/simulation/major-resources";
import { type SectionKind } from "../src/simulation/major-schema";
import { capacity, tick, hospital, readiness } from "../src/engine";
import { publicSave } from "../src/simulation/incidents";
import { transportCandidates } from "../src/simulation/patients";
import { updateWeather } from "../src/simulation/weather";
import { simId } from "../src/simulation/events";
import { validate, type Save } from "../src/model";
import { Database, DATABASE_VERSION } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import type { ServerAction } from "../server/actions";
import { alarm } from "../src/simulation/dispatch";
import { spawnSync } from "node:child_process";

it("Massenereignis benötigt wirksame Besucherlenkung und Evakuierung auch nach dem Abschnittsaufbau", () => {
  const s = majorFixture("crowd", "match"),
    m = s.missions[0];
  declareMajor(s, m);
  orders(s);
  assign(s, 2, "command");
  assign(s, 11, "security");
  assign(s, 10, "evacuation");
  majorCommand(
    s,
    {
      type: "major-leader",
      mission: m.id,
      section: "evacuation",
      vehicle: s.vehicles[10].id,
    },
    "actor",
  );
  majorTick(s, m, capacity(s, m.id), 80);
  const evac = m.major!.sections.find((x) => x.kind === "evacuation")!;
  expect(m.major!.kind).toBe("crowd");
  expect(capacity(s, m.id).crowd).toBeGreaterThanOrEqual(4);
  expect(evac.done).toBe(true);
  expect(m.major!.evacuated).toBeLessThan(m.major!.evacuees);
  const saved = m.major!.evacuated;
  assign(s, 10, "staging");
  majorTick(s, m, capacity(s, m.id), 60);
  expect(m.major!.evacuated).toBe(saved);
  expect(m.major!.shortage).toContain("Evakuierung");
  assign(s, 10, "evacuation");
  majorTick(s, m, capacity(s, m.id), 60);
  expect(m.major!.evacuated).toBe(m.major!.evacuees);
});

function assign(s: Save, index: number, section: SectionKind) {
  const m = s.missions[0],
    v = s.vehicles[index];
  if (v.status === "ready") atScene(s, v);
  majorCommand(
    s,
    { type: "major-assign", mission: m.id, vehicle: v.id, section },
    "test",
  );
}
function orders(s: Save) {
  for (const x of s.missions[0].major!.sections)
    majorCommand(
      s,
      {
        type: "major-section",
        mission: s.missions[0].id,
        section: x.kind,
        priority: 1,
      },
      "test",
    );
}
function fireSetup(s: Save) {
  declareMajor(s, s.missions[0]);
  orders(s);
  assign(s, 0, "fire");
  assign(s, 1, "water");
  assign(s, 2, "command");
  assign(s, 3, "rescue");
}
it("Großlage bleibt bis zur Erkundung verborgen, Altfälle erhalten keine Pflichtabschnitte", () => {
  const s = majorFixture(),
    m = s.missions[0];
  expect(m.major).toBeUndefined();
  expect(validate(s).missions[0].major).toBeUndefined();
  m.control!.briefed = false;
  expect(() =>
    majorCommand(s, { type: "major-declare", mission: m.id }, "actor"),
  ).toThrow("Lagemeldung");
  declareMajor(s, m);
  expect(publicSave(s).missions[0].major).toBeUndefined();
  expect(
    publicSave(s).missions[0].control!.events.some((e) =>
      e.type.startsWith("MAJOR_"),
    ),
  ).toBe(false);
  m.control!.briefed = true;
  expect(publicSave(s).missions[0].major).not.toHaveProperty("pending");
  expect(m.major!.pending).toBeDefined();
});
it("Bereitstellung hat keine operative Wirkung; Zuweisungen sind eindeutig und an die Alarmierung gebunden", () => {
  const s = majorFixture(),
    m = s.missions[0],
    v = s.vehicles[0];
  declareMajor(s, m);
  orders(s);
  atScene(s, v);
  expect(capacity(s, m.id)).toEqual({});
  assign(s, 0, "fire");
  expect(capacity(s, m.id).fire).toBe(2);
  expect(capacity(s, m.id).water).toBeUndefined();
  assign(s, 0, "rescue");
  expect(capacity(s, m.id).fire).toBeUndefined();
  expect(capacity(s, m.id).rescue).toBe(2);
  expect(m.major!.placements).toHaveLength(1);
  expect(() => assign(s, 0, "medical")).toThrow("passt nicht");
  v.assignment = simId(s);
  expect(effectiveSkills(m, v)).toEqual({});
});
it("Abschnitte brauchen echte Führung und Kräfte; Reservefreigabe ersetzt keine Abschnittszuweisung", () => {
  const s = majorFixture(),
    m = s.missions[0];
  declareMajor(s, m);
  orders(s);
  assign(s, 0, "fire");
  majorTick(s, m, capacity(s, m.id), 60);
  expect(m.major!.sections.find((x) => x.kind === "fire")!.progress).toBe(0);
  assign(s, 2, "command");
  majorTick(s, m, capacity(s, m.id), 60);
  expect(
    m.major!.sections.find((x) => x.kind === "fire")!.progress,
  ).toBeGreaterThan(0);
  expect(m.major!.shortage).toContain("Wasserversorgung");
  expect(majorComplete(m)).toBe(false);
});
it("Großbrand verbraucht Löschwasser; fehlender Nachschub mindert die tatsächliche Löschleistung", () => {
  const s = majorFixture(),
    m = s.missions[0];
  fireSetup(s);
  assign(s, 1, "staging");
  m.major!.water = 0;
  let skills = capacity(s, m.id);
  majorTick(s, m, skills, 5);
  expect(skills.fire).toBeLessThan(2);
  expect(m.major!.shortage).toContain("Löschwasser");
  assign(s, 1, "water");
  skills = capacity(s, m.id);
  majorTick(s, m, skills, 5);
  expect(skills.fire).toBe(2);
  expect(m.major!.water).toBeGreaterThan(0);
});
it("MANV-Nacherkundung erzeugt begrenzte Patientenwellen und identische Fortsetzung nach Speichern", () => {
  const s = majorFixture("a", "crash"),
    m = s.missions[0];
  declareMajor(s, m);
  expect(m.dynamics!.patients).toHaveLength(5);
  const b = validate(JSON.parse(JSON.stringify(s)));
  for (const x of [s, b])
    for (let i = 0; i < 100; i++) {
      x.time += 5;
      majorTick(x, x.missions[0], {}, 5);
    }
  expect(s).toEqual(b);
  expect(m.dynamics!.patients).toHaveLength(11);
  expect(m.major!.pending!.remaining).toBe(0);
  expect(m.major!.level).toBe(3);
  expect(
    m.control!.events.filter((e) => e.type === "MAJOR_PATIENTS_FOUND"),
  ).toHaveLength(2);
});
it("Sichtung benötigt medizinische Kräfte und priorisiert geeignete Transporte samt Klinikverteilung", () => {
  const s = majorFixture("a", "crash"),
    m = s.missions[0];
  declareMajor(s, m);
  orders(s);
  const p = m.dynamics!.patients[0];
  const action = {
    type: "major-triage" as const,
    mission: m.id,
    patient: p.id,
    category: "I" as const,
    hospital: "public",
  };
  expect(() => majorCommand(s, action, "actor")).toThrow("medizinische");
  assign(s, 5, "medical");
  m.organization!.tasks.forEach((t) => {
    t.done = true;
    t.ordered = true;
    t.progress = t.seconds;
  });
  majorCommand(s, action, "actor");
  p.health = 85;
  p.treatment = 90;
  expect(transportCandidates(m)[0].id).toBe(p.id);
  expect(() =>
    majorCommand(s, { ...action, hospital: "foreign-hospital" }, "actor"),
  ).toThrow("Krankenhaus");
  expect(hospital(s, m.pos, 1, m, s.vehicles[5])!.id).toBe("public");
  expect(() =>
    majorCommand(
      s,
      { type: "major-transports", mission: m.id, enabled: true },
      "actor",
    ),
  ).toThrow("aufbauen");
  m.major!.sections.find((x) => x.kind === "medical")!.done = true;
  majorCommand(
    s,
    { type: "major-transports", mission: m.id, enabled: true },
    "actor",
  );
  tick(s, s.time + 5, {}, false, false);
  expect(p.transport).toBe("aboard");
  expect(s.vehicles[5].status).toBe("transport");
  expect(m.phase).not.toBe("transport");
  expect(m.major!.pending!.remaining).toBe(2);
});
it("eine vollständig disponierte Großbrandlage erreicht Archiv und zahlt genau einmal", () => {
  const s = majorFixture(),
    m = s.missions[0];
  fireSetup(s);
  const original = s.money;
  for (let i = 0; i < 240 && s.missions.some((x) => x.id === m.id); i++)
    tick(s, s.time + 5, {}, false, false);
  expect(s.archive.find((x) => x.id === m.id)?.phase).toBe("done");
  expect(s.money).toBeGreaterThan(original);
  const paid = s.money;
  tick(s, s.time + 60, {}, false, false);
  expect(s.money).toBe(paid);
  expect(validate(s).archive[0].major!.sections.every((x) => x.done)).toBe(
    true,
  );
});
it("Flächenlage erzeugt einzeln versetzte Meldungen, hält das Zweierlimit ein und archiviert den Verbund", () => {
  const s = majorFixture("a", "cellar"),
    m = s.missions[0];
  declareMajor(s, m);
  const create = (template: string, pos: { x: number; y: number }) => {
    const n = structuredClone(m);
    n.id = simId(s);
    n.round = simId(s);
    n.template = template;
    n.pos = pos;
    delete n.major;
    s.missions.push(n);
    return n;
  };
  s.time += 1000;
  s.missionWait = 0;
  expect(campaignTick(s, create)).toBe(true);
  expect(s.missions).toHaveLength(2);
  expect(campaignTick(s, create)).toBe(false);
  expect(s.operations.campaign!.remaining).toBe(3);
  for (let i = 0; i < 3; i++) {
    s.archive.push(...s.missions.splice(0));
    s.time += 400;
    s.missionWait = 0;
    expect(campaignTick(s, create)).toBe(true);
  }
  s.archive.push(...s.missions.splice(0));
  campaignTick(s, create);
  expect(s.operations.campaign).toBeUndefined();
  expect(s.operations.history[0].missions).toHaveLength(5);
});
it("Hochwasser sperrt reale Straßen und gibt sie nach Gefahrenbeseitigung wieder frei", () => {
  const s = majorFixture("a", "cellar"),
    m = s.missions[0];
  declareMajor(s, m);
  updateWeather(s);
  expect(
    s.environment!.roads.some(
      (r) => r.id === `major-road:${m.id}` && r.blocked,
    ),
  ).toBe(true);
  m.dynamics!.hazards.forEach((h) => {
    h.resolved = true;
    h.value = 0;
  });
  updateWeather(s);
  expect(s.environment!.roads.some((r) => r.id === `major-road:${m.id}`)).toBe(
    false,
  );
});
it("Großlagenzufall respektiert Flottenschwelle und Abklingzeit", () => {
  const s = majorFixture(),
    m = s.missions[0];
  s.operations.cooldown = s.time + 1;
  maybeMajor(s, m);
  expect(m.major).toBeUndefined();
  s.operations.cooldown = 0;
  s.vehicles = s.vehicles.slice(0, 2);
  maybeMajor(s, m);
  expect(m.major).toBeUndefined();
});

async function databaseWorld() {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase4-"));
  const db = new Database(dir),
    auth = new Auth(db);
  const owner = await auth.create(
      "owner",
      "Phase-four-password-123!",
      "Nord",
      "Nord",
    ),
    peer = await auth.create("peer", "Phase-four-password-123!", "Süd", "Süd");
  db.save(owner, majorFixture(owner));
  db.save(peer, majorFixture(peer, "field", "south"));
  return { dir, db, owner, peer, game: new Game(db) };
}
it("Server schützt fremde und doppelte Großlagenaktionen und erhält sie über Neustart", async () => {
  const w = await databaseWorld();
  let db = w.db;
  try {
    const m = db.all().get(w.owner)!.missions[0];
    const input = {
      id: crypto.randomUUID(),
      action: { type: "major-declare", mission: m.id },
    };
    expect(() => w.game.command(w.peer, input)).toThrow("Eigener");
    w.game.command(w.owner, input);
    w.game.command(w.owner, input);
    expect(
      db
        .all()
        .get(w.owner)!
        .missions[0].control!.events.filter((e) => e.type === "MAJOR_DECLARED"),
    ).toHaveLength(1);
    const before = db.all().get(w.owner)!;
    db.close();
    db = new Database(w.dir);
    expect(db.all().get(w.owner)).toEqual(before);
    expect(new Game(db).view(w.peer, new Set()).network.friends).toHaveLength(
      0,
    );
  } finally {
    db.close();
  }
});
it("Migration 8→9 bewahrt beide Spielstände und laufende Alarmierungen mit Originalbackup", async () => {
  const w = await databaseWorld();
  let db = w.db;
  try {
    const s = db.all().get(w.owner)!;
    alarm(s, s.missions[0], [s.vehicles[0].id], w.owner);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.operations;
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(raw), w.owner);
    db.save(w.owner, s, "single");
    db.sql
      .prepare("UPDATE solo_saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(raw), w.owner);
    db.sql.exec("PRAGMA user_version=8");
    db.close();
    db = new Database(w.dir);
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    for (const mode of ["multi", "single"] as const) {
      const actual = db.all(mode).get(w.owner)!;
      expect({ ...actual, people: undefined }).toEqual({
        ...s,
        people: undefined,
      });
      expect(actual.people).toHaveLength(s.people.length);
      for (const before of s.people) {
        const person = actual.people.find((p) => p.id === before.id)!;
        // v14 adds building-provided qualifications; identity, binding and injuries stay exact.
        expect({ ...person, skills: before.skills }).toEqual(before);
        expect(person.skills).toEqual(expect.arrayContaining(before.skills));
      }
    }
    const file = (await readdir(w.dir)).find((x) =>
      x.startsWith("pre-migration-v2-"),
    )!;
    const backup = new DatabaseSync(resolve(w.dir, file), { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get()!.user_version).toBe(8);
    expect(
      JSON.parse(
        String(
          backup.prepare("SELECT data FROM saves WHERE user_id=?").get(w.owner)!
            .data,
        ),
      ),
    ).not.toHaveProperty("operations");
    backup.close();
  } finally {
    db.close();
  }
});
it("angenommene Nachbarkräfte bleiben in Bereitstellung bis zur autorisierten Abschnittszuweisung", async () => {
  const w = await databaseWorld();
  const command = (who: string, action: ServerAction) =>
    w.game.command(who, { id: crypto.randomUUID(), action });
  try {
    const s = w.db.all().get(w.owner)!,
      m = s.missions[0],
      v = w.db.all().get(w.peer)!.vehicles[0];
    command(w.owner, { type: "major-declare", mission: m.id });
    command(w.owner, {
      type: "aid-draft",
      peer: w.peer,
      mission: m.id,
      types: [v.type],
      message: "Abschnitt Brand benötigt ein HLF",
      priority: "DRINGEND",
    });
    const id = w.db.all().get(w.owner)!.aid[0].id;
    command(w.owner, { type: "aid-send", id });
    command(w.peer, {
      type: "aid-accept",
      owner: w.owner,
      id,
      vehicles: [v.id],
    });
    expect(() =>
      command(w.peer, {
        type: "major-assign",
        mission: m.id,
        vehicle: v.id,
        section: "fire",
      }),
    ).toThrow("Eigener");
    w.game.step(120);
    let actual = w.db.all().get(w.peer)!.vehicles[0];
    expect(actual.status).toBe("scene");
    expect(
      effectiveSkills(w.db.all().get(w.owner)!.missions[0], actual),
    ).toEqual({});
    command(w.owner, {
      type: "major-section",
      mission: m.id,
      section: "fire",
      priority: 1,
    });
    command(w.owner, {
      type: "major-assign",
      mission: m.id,
      vehicle: v.id,
      section: "fire",
    });
    actual = w.db.all().get(w.peer)!.vehicles[0];
    expect(
      effectiveSkills(w.db.all().get(w.owner)!.missions[0], actual).fire,
    ).toBe(2);
    expect(w.db.all().get(w.owner)!.missions[0].shared).toBe(false);
  } finally {
    w.db.close();
  }
});
it("MANV läuft über Nacherkundung, wiederholte RTW-Fahrten und dynamische Versorgung bis zum einmaligen Abschluss", async () => {
  const w = await databaseWorld();
  const command = (action: ServerAction) =>
    w.game.command(w.owner, { id: crypto.randomUUID(), action });
  try {
    const initial = majorFixture(w.owner, "crash");
    w.db.save(w.owner, initial);
    const id = initial.missions[0].id;
    command({ type: "major-declare", mission: id });
    for (const section of w.db.all().get(w.owner)!.missions[0].major!.sections)
      command({
        type: "major-section",
        mission: id,
        section: section.kind,
        priority: 1,
      });
    for (const task of initial.missions[0].organization!.tasks)
      command({ type: "organization-task", mission: id, task: task.kind });
    const allocations: Record<string, SectionKind> = {
      elw: "command",
      hlf: "rescue",
      rtw: "medical",
      nef: "medical",
      fustw: "security",
      pmtw: "security",
    };
    const allocated = initial.vehicles.filter((v) => allocations[v.type]);
    command({
      type: "dispatch",
      mission: id,
      vehicles: allocated.map((v) => v.id),
    });
    for (const v of allocated)
      command({
        type: "major-assign",
        mission: id,
        vehicle: v.id,
        section: allocations[v.type],
      });
    for (let i = 0; i < 180; i++) {
      const s = w.db.all().get(w.owner)!,
        m = s.missions.find((x) => x.id === id);
      if (!m) break;
      for (const v of s.vehicles)
        if (v.fault?.state === "awaiting")
          command({ type: "repair", vehicle: v.id });
      const medical = s.vehicles.some(
        (v) =>
          v.mission === id &&
          v.status === "scene" &&
          effectiveSkills(m, v).medical,
      );
      if (medical && m.organization!.tasks.every((t) => t.done)) {
        for (const p of m.dynamics!.patients.filter(
          (p) => !p.triage && p.transport === "scene" && p.condition !== "dead",
        ))
          command({
            type: "major-triage",
            mission: id,
            patient: p.id,
            category: p.health < 65 ? "I" : "II",
            hospital: "public",
          });
      }
      if (
        !m.major!.transports &&
        m.major!.sections.find((x) => x.kind === "medical")!.done
      )
        command({ type: "major-transports", mission: id, enabled: true });
      if (
        m.dynamics!.patients.some(
          (p) => p.transport === "scene" && p.condition !== "dead",
        ) ||
        m.major!.pending?.remaining
      ) {
        for (const v of s.vehicles.filter(
          (v) =>
            v.type === "rtw" &&
            v.status === "ready" &&
            !readiness(s, v) &&
            (!v.fault || v.fault.state === "repaired"),
        )) {
          command({ type: "dispatch", mission: id, vehicles: [v.id] });
          command({
            type: "major-assign",
            mission: id,
            vehicle: v.id,
            section: "medical",
          });
        }
      }
      w.game.step(30);
    }
    const result = w.db
      .all()
      .get(w.owner)!
      .archive.find((m) => m.id === id);
    expect(
      result,
      JSON.stringify(
        w.db
          .all()
          .get(w.owner)!
          .missions.find((m) => m.id === id),
      ),
    ).toBeDefined();
    expect(result!.dynamics!.patients).toHaveLength(11);
    expect(result!.transports.length).toBeGreaterThan(4);
    expect(
      result!.dynamics!.patients.every(
        (p) => p.transport === "delivered" || p.condition === "dead",
      ),
    ).toBe(true);
    const paid = w.db.all().get(w.owner)!.money;
    w.game.step(60);
    expect(w.db.all().get(w.owner)!.money).toBe(paid);
  } finally {
    w.db.close();
  }
}, 30000);
it("Nachbar-RTW baut den Behandlungsabschnitt auf und beginnt einen freigegebenen MANV-Transport vor Einsatzende", async () => {
  const w = await databaseWorld();
  const command = (who: string, action: ServerAction) =>
    w.game.command(who, { id: crypto.randomUUID(), action });
  try {
    const s = majorFixture(w.owner, "crash"),
      m = s.missions[0];
    declareMajor(s, m);
    orders(s);
    assign(s, 2, "command");
    m.organization!.tasks.forEach((t) => {
      t.done = true;
      t.progress = t.seconds;
      t.ordered = true;
    });
    m.dynamics!.patients[0].health = 85;
    m.dynamics!.patients[0].treatment = 90;
    w.db.save(w.owner, s);
    const v = w.db
      .all()
      .get(w.peer)!
      .vehicles.find((v) => v.type === "rtw")!;
    command(w.owner, {
      type: "aid-draft",
      peer: w.peer,
      mission: m.id,
      types: ["rtw"],
      message: "MANV-Transport benötigt",
      priority: "NOTFALL",
    });
    const id = w.db.all().get(w.owner)!.aid[0].id;
    command(w.owner, { type: "aid-send", id });
    command(w.peer, {
      type: "aid-accept",
      owner: w.owner,
      id,
      vehicles: [v.id],
    });
    command(w.owner, {
      type: "major-assign",
      mission: m.id,
      vehicle: v.id,
      section: "medical",
    });
    w.game.step(240);
    const actual = w.db.all().get(w.owner)!.missions[0];
    expect(actual.major!.sections.find((x) => x.kind === "medical")!.done).toBe(
      true,
    );
    command(w.owner, {
      type: "major-triage",
      mission: m.id,
      patient: actual.dynamics!.patients[0].id,
      category: "I",
      hospital: "public",
    });
    command(w.owner, {
      type: "major-transports",
      mission: m.id,
      enabled: true,
    });
    w.game.step(5);
    const result = w.db.all().get(w.owner)!.missions[0];
    expect(result.dynamics!.patients[0].transport).toBe("aboard");
    expect(result.transports[0].owner).toBe(w.peer);
    expect(result.phase).not.toBe("transport");
    expect(
      w.db
        .all()
        .get(w.peer)!
        .vehicles.find((x) => x.id === v.id)!.status,
    ).toBe("transport");
    expect(() =>
      command(w.owner, { type: "aid-close", owner: w.owner, id, op: "cancel" }),
    ).toThrow("Patient");
  } finally {
    w.db.close();
  }
});
it("Offline-Aufholen erzeugt keine Einsatzflut und ein voller Patientenbestand blockiert keinen Abschluss dauerhaft", async () => {
  const w = await databaseWorld();
  try {
    const s = majorFixture(w.owner, "cellar");
    declareMajor(s, s.missions[0]);
    w.db.save(w.owner, s);
    w.game.step(3600);
    expect(w.db.all().get(w.owner)!.missions).toHaveLength(1);
    for (let i = 0; i < 50; i++) w.game.step(5);
    expect(w.db.all().get(w.owner)!.missions).toHaveLength(1);
    expect(w.db.all().get(w.owner)!.operations.campaign!.remaining).toBe(4);
    const other = majorFixture("other", "crash"),
      m = other.missions[0];
    declareMajor(other, m);
    while (m.dynamics!.patients.length < 30) {
      const p = structuredClone(m.dynamics!.patients[0]);
      p.id = simId(other);
      m.dynamics!.patients.push(p);
    }
    majorTick(other, m, {}, 5);
    expect(m.major!.pending!.remaining).toBe(0);
    m.phase = "transport";
    delete m.major;
    expect(() => declareMajor(other, m)).toThrow();
  } finally {
    w.db.close();
  }
}, 30000);
it("Abschnittsleitung fällt bei Rücknahme oder Defekt aus und kann bewusst neu vergeben werden", () => {
  const s = majorFixture(),
    m = s.missions[0];
  fireSetup(s);
  majorCommand(
    s,
    {
      type: "major-leader",
      mission: m.id,
      section: "fire",
      vehicle: s.vehicles[0].id,
    },
    "actor",
  );
  assign(s, 0, "staging");
  assign(s, 4, "fire");
  majorTick(s, m, capacity(s, m.id), 30);
  expect(m.major!.sections.find((x) => x.kind === "fire")!.progress).toBe(0);
  majorCommand(
    s,
    {
      type: "major-leader",
      mission: m.id,
      section: "fire",
      vehicle: s.vehicles[4].id,
    },
    "actor",
  );
  majorTick(s, m, capacity(s, m.id), 30);
  expect(
    m.major!.sections.find((x) => x.kind === "fire")!.progress,
  ).toBeGreaterThan(0);
});
it("aktive Großlage übersteht echte CLI-Sicherung und Wiederherstellung mit identischer Fortsetzung", async () => {
  const w = await databaseWorld();
  let db = w.db;
  try {
    const s = db.all().get(w.owner)!;
    fireSetup(s);
    tick(s, s.time + 30, {}, false, false);
    db.save(w.owner, s);
    const backup = await db.backup();
    const restoredDir = await mkdtemp(resolve(tmpdir(), "lv-phase4-restore-"));
    const result = spawnSync(
      process.execPath,
      [
        ".tools/legacy-tests/server/cli.js",
        "restore",
        "--file",
        backup,
        "--confirm",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATA_DIR: restoredDir },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    db.close();
    db = new Database(restoredDir);
    const restored = db.all().get(w.owner)!;
    expect(restored).toEqual(s);
    for (const state of [s, restored])
      for (let i = 0; i < 80; i++)
        tick(state, state.time + 5, {}, false, false);
    expect(restored).toEqual(s);
  } finally {
    db.close();
  }
}, 30000);
