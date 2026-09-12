import "fake-indexeddb/auto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { commandSchema } from "../src/server/actions";
import { Auth } from "../src/server/auth";
import { balanceAudit } from "../src/server/balance";
import { Database, DATABASE_VERSION } from "../src/server/database";
import { Game } from "../src/server/game";
import { createLab, runLab, stateHash, verifyLab } from "../src/server/lab";
import { parseSound } from "../src/client/audio/controller";
import {
  checkSoundFile,
  customSounds,
  storeSound,
} from "../src/client/audio/custom";
import { AudioEvents } from "../src/client/audio/events";
import { tick } from "../src/shared/engine";
import { validate } from "../src/shared/model";
import { reportDocument, reportsCSV } from "../src/client/reports/export";
import { nextCallDelay } from "../src/simulation/balance";
import { alarm, propose } from "../src/simulation/dispatch";
import { record } from "../src/simulation/events";
import { publicSave } from "../src/simulation/incidents";
import {
  buildReport,
  finalizeReport,
  measureTravel,
  migrateReports,
} from "../src/simulation/reports";
import {
  missionList,
  parseWorkspace,
  shortcutFor,
} from "../src/client/workspace";
import { length, METERS_PER_UNIT } from "../src/shared/world";
import "./fixtures/germany/session";
import { completedLab, completedSave } from "./reports-replay-fixture";

it("automatische Brandmeldung wird erst durch Erkundung zum bestätigten Fehlalarm und geht in die Statistik ein", () => {
  let lab = runLab(createLab(124), { type: "generate", template: "bma-false" });
  lab = runLab(lab, { type: "interview", mission: lab.save.missions[0].id });
  expect(publicSave(lab.save).missions[0].template).toBe("reported-fire");
  expect(JSON.stringify(publicSave(lab.save))).not.toContain("Fehlalarm");
  expect(lab.save.missions[0].dynamics!.fire).toBeUndefined();
  const finished = completedLab(124, "bma-false");
  expect(finished.save.archive[0].report!.falseAlarm).toBe(true);
  expect(finished.save.statistics.falseAlarms).toBe(1);
  expect(verifyLab(finished).verified).toBe(true);
});

it("vollständiger Ablauf erzeugt unveränderliche Berichte, echte Zeiten, Buchungen und Fahrstrecken genau einmal", () => {
  const lab = completedLab(),
    s = lab.save,
    m = s.archive[0],
    r = m.report!;
  expect(r.partial).toBe(false);
  expect(r.units).toHaveLength(2);
  expect(r.timings.reaction).toBe(0);
  expect(r.timings.disposition).toBe(10);
  expect(r.timings.turnout).toBeGreaterThan(0);
  expect(r.timings.travel).toBeGreaterThan(0);
  expect(r.timings.total).toBe(m.completed - m.created);
  expect(r.credits).toBe(625000);
  expect(r.xp).toBeGreaterThan(0);
  expect(r.meters).toBeGreaterThan(0);
  expect(r.units.reduce((a, u) => a + u.meters, 0)).toBeCloseTo(r.meters, 8);
  expect(s.statistics.completed).toBe(1);
  expect(s.statistics.credits).toBe(625000);
  const frozen = structuredClone(r),
    prior = structuredClone(s.statistics);
  finalizeReport(s, m);
  migrateReports(s);
  tick(s, s.time, {}, false, false);
  expect(s.statistics).toEqual(prior);
  expect(m.report).toEqual(frozen);
  tick(s, s.time + 300, {}, false, false);
  expect(m.report).toEqual(frozen);
  expect(s.statistics.completed).toBe(1);
  expect(s.statistics.meters).toBeGreaterThan(prior.meters);
});

it("Kilometer zählen nur gefahrene Routenanteile einschließlich Rückweg, keine Standzeit oder doppelte Zeit", () => {
  const s = createLab(7).save,
    v = s.vehicles[0];
  v.status = "travel";
  v.path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  v.depart = s.time;
  v.arrive = s.time + 100;
  const start = s.time,
    total = length(v.path) * METERS_PER_UNIT;
  s.time += 50;
  measureTravel(s, v, start);
  expect(v.odometer).toBeCloseTo(total / 2);
  measureTravel(s, v, s.time);
  expect(v.odometer).toBeCloseTo(total / 2);
  s.time += 70;
  measureTravel(s, v, start + 50);
  expect(v.odometer).toBeCloseTo(total);
  v.status = "scene";
  s.time += 50;
  measureTravel(s, v, s.time - 50);
  expect(v.odometer).toBeCloseTo(total);
  v.status = "return";
  v.depart = s.time;
  v.arrive = s.time + 100;
  s.time += 100;
  measureTravel(s, v, s.time - 100);
  expect(v.odometer).toBeCloseTo(total * 2);
  expect(s.statistics.meters).toBeCloseTo(total * 2);
});

it("Archivmigration 9→10 ergänzt beide Modi, lässt Fakten und Geld bestehen und übersteht den zweiten Neustart", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase5-migrate-"));
  let db = new Database(dir);
  try {
    const owner = await new Auth(db).create(
      "reports",
      "Migration-password-123!",
      "Test",
      "Leitstelle",
    );
    const s = completedSave(owner);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.statistics;
    for (const m of [...raw.archive, ...raw.missions]) {
      delete m.report;
      delete m.telemetry;
    }
    for (const v of raw.vehicles) delete v.odometer;
    db.save(owner, s);
    db.save(owner, s, "single");
    for (const table of ["saves", "solo_saves"])
      db.sql
        .prepare(`UPDATE ${table} SET data=? WHERE user_id=?`)
        .run(JSON.stringify(raw), owner);
    db.sql.exec("PRAGMA user_version=9");
    db.close();
    db = new Database(dir);
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    const migrated = db.all().get(owner)!;
    expect(migrated.money).toBe(s.money);
    expect(migrated.archive[0].control).toEqual(s.archive[0].control);
    expect(migrated.archive[0].report).toMatchObject({
      partial: true,
      credits: null,
      xp: null,
      meters: 0,
    });
    expect(migrated.archive[0].report!.timings.total).toBe(
      s.archive[0].report!.timings.total,
    );
    expect(migrated.statistics.completed).toBe(1);
    expect(db.all("single").get(owner)).toEqual(migrated);
    const file = (await readdir(dir)).find((n) =>
      n.startsWith("pre-migration-v2-"),
    )!;
    const backup = new DatabaseSync(resolve(dir, file), { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get()!.user_version).toBe(9);
    backup.close();
    db.close();
    db = new Database(dir);
    expect(db.all().get(owner)).toEqual(migrated);
  } finally {
    db.close();
  }
});

it("Berichte, Suche und lokale Exporte sind lesend und enthalten keine verborgenen Szenariodaten", () => {
  const s = completedLab().save,
    before = stateHash(s);
  const view = publicSave(s),
    m = view.archive[0],
    doc = reportDocument(m);
  expect(JSON.stringify(doc)).not.toContain('"secret"');
  expect(doc.report).toEqual(m.report);
  expect(reportsCSV([m])).toContain("Dauer (s)");
  expect(stateHash(s)).toBe(before);
  m.id = '=HYPERLINK("http://bad.invalid")';
  expect(reportsCSV([m])).toContain("\"'=HYPERLINK");
  delete m.report;
  delete m.telemetry;
  expect(buildReport(m).credits).toBeNull();
  const clean = structuredClone(view);
  migrateReports(clean);
  expect(clean.archive[0].report!.partial).toBe(true);
});

it("Server trennt Statistiken nach Leitstelle und Modus; Client darf weder Messwerte noch Entwickleraktionen setzen", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase5-access-")),
    db = new Database(dir);
  try {
    const auth = new Auth(db),
      owner = await auth.create(
        "owner",
        "Phase-five-password-123!",
        "Nord",
        "Nord",
      ),
      peer = await auth.create(
        "peer",
        "Phase-five-password-123!",
        "Süd",
        "Süd",
      );
    const s = completedSave(owner);
    db.save(owner, s);
    const game = new Game(db, () => true);
    expect(game.view(owner, new Set()).save.statistics.completed).toBe(1);
    expect(() => game.view(owner, new Set(), "single" as never)).toThrow(
      "Multiplayer",
    );
    expect(game.view(peer, new Set()).save.archive).toEqual([]);
    for (const action of [
      { type: "statistics", completed: 99 },
      { type: "weather", kind: "fog" },
      { type: "generate", template: "bin" },
      { type: "advance", seconds: 1000 },
    ])
      expect(
        commandSchema.safeParse({ id: crypto.randomUUID(), action }).success,
      ).toBe(false);
  } finally {
    db.close();
  }
});

it("Entwicklerlabor wiederholt alle Aktionen deterministisch und erkennt manipulierte Zustände und Prüfsummen", () => {
  const lab = completedLab();
  expect(verifyLab(lab).verified).toBe(true);
  const tampered = structuredClone(lab);
  tampered.save.money++;
  expect(() => verifyLab(tampered)).toThrow("Endzustand");
  tampered.save.money--;
  tampered.hashes[0] = "0".repeat(64);
  expect(() => verifyLab(tampered)).toThrow("Aktion 1");
  const before = stateHash(lab.save);
  expect(() => runLab(lab, { type: "damage", vehicle: "foreign" })).toThrow();
  expect(stateHash(lab.save)).toBe(before);
  expect(() => runLab(lab, { type: "advance", seconds: -1 })).toThrow();
  expect(() => createLab(-1)).toThrow();
});

it("CLI erstellt isolierte Labordateien, prüft Replay und überschreibt keine vorhandene Datei", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase5-cli-")),
    file = resolve(dir, "lab.json");
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/lab.mjs", ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
  expect(cli("create", "--seed", "73", "--out", file).status).toBe(0);
  const original = await readFile(file);
  expect(cli("create", "--seed", "124", "--out", file).status).not.toBe(0);
  expect(await readFile(file)).toEqual(original);
  const action = resolve(dir, "action.json"),
    next = resolve(dir, "next.json");
  await writeFile(
    action,
    JSON.stringify({ type: "generate", template: "bin" }),
  );
  expect(
    cli("step", "--in", file, "--action", action, "--out", next).status,
  ).toBe(0);
  expect(cli("verify", "--in", next).stdout).toContain('"verified": true');
  expect(
    cli("events", "--in", next, "--out", resolve(dir, "events.json")).status,
  ).toBe(0);
}, 20000);

it("Balancing prüft neun vollständige kleine Einsätze mit drei Seeds und deckt alle Katalogfähigkeiten ab", () => {
  const a = balanceAudit();
  expect(a.scenarios).toHaveLength(9);
  expect(a.catalog.impossible).toEqual([]);
  expect(a.activeLimit).toBeNull();
  expect(
    a.scenarios.every(
      (s) =>
        s.seconds >= 60 + s.meters / (80 / 3.6) &&
        s.seconds < 600 &&
        s.credits! > 0,
    ),
  ).toBe(true);
  expect(balanceAudit()).toEqual(a);
}, 15000);

it("Arbeitsplatz und Hotkeys normalisieren kaputte Einstellungen, ignorieren Texteingabe und Doppelbelegungen", () => {
  expect(parseWorkspace("null").width).toBe(320);
  const p = parseWorkspace(
    JSON.stringify({ side: "right", width: 999, keys: { call: "f" } }),
  );
  expect(p.side).toBe("left");
  expect(p.width).toBe(320);
  expect(p.keys.fms).toBe("");
  const e = {
    key: "F",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
  };
  expect(shortcutFor(e, p.keys, false)).toBe("call");
  expect(shortcutFor(e, p.keys, true)).toBeUndefined();
  expect(shortcutFor({ ...e, ctrlKey: true }, p.keys, false)).toBeUndefined();
});

it("Filter verwenden nur freigegebene Informationen und verändern den Spielstand nicht", () => {
  const lab = runLab(createLab(4), { type: "generate", template: "field" }),
    s = publicSave(lab.save),
    before = stateHash(s);
  expect(missionList(s, "Flächenbrand", "all", "priority")).toHaveLength(0);
  expect(missionList(s, "Ungeklärter", "all", "time")).toHaveLength(1);
  expect(missionList(s, "", "request", "priority")).toHaveLength(0);
  expect(stateHash(s)).toBe(before);
});

it("Kanalregler migrieren alte Audiowerte und dringender Funk gewinnt genau einmal gegen gewöhnliche Meldungen", () => {
  const p = parseSound(
    '{"masterVolume":999,"channels":{"radio":-1,"siren":"oops"}}',
  );
  expect(p.masterVolume).toBe(100);
  expect(p.channels.radio).toBe(0);
  expect(p.channels.siren).toBe(100);
  const events = new AudioEvents(),
    lab = runLab(createLab(3), { type: "generate", template: "bin" }),
    s = lab.save;
  events.observe(s, "multi", true);
  const next = structuredClone(s);
  next.revision++;
  next.missions[0].control!.radio.push({
    id: "urgent",
    vehicle: "",
    reason: "question",
    priority: "NOTFALL",
    state: "open",
    created: next.time,
    answered: 0,
    details: "Dringend",
  });
  record(next, next.missions[0], "CALL_RECEIVED", "Neuer Anruf");
  expect(events.observe(next, "multi", true)).toBe("emergency");
  expect(events.observe(next, "multi", true)).toBeNull();
});

it("Eigene Signale prüfen das Format und bleiben lokal mit rücksetzbaren Kanälen", async () => {
  const bytes = new TextEncoder().encode("RIFF0000WAVEtest").buffer;
  expect(() => checkSoundFile("tone.wav", bytes)).not.toThrow();
  expect(() => checkSoundFile("tone.html", bytes)).toThrow();
  expect(() => checkSoundFile("tone.wav", new ArrayBuffer(3e6))).toThrow();
  await storeSound("radio", {
    channel: "radio",
    name: "tone.wav",
    data: bytes,
  });
  expect((await customSounds()).some((s) => s.name === "tone.wav")).toBe(true);
  await storeSound("radio");
  expect((await customSounds()).some((s) => s.channel === "radio")).toBe(false);
});

it("verwendete AAO und Nachforderungen werden genau einmal ausgewertet, auch mit maximal langen AAO-Kennungen", () => {
  let lab = runLab(createLab(124), { type: "generate", template: "bin" });
  lab = runLab(lab, { type: "interview", mission: lab.save.missions[0].id });
  const s = lab.save,
    m = s.missions[0],
    id = "x".repeat(100);
  const aao = {
    id,
    name: "Kleiner Brand",
    keyword: "Brand",
    level: 1,
    org: "Alle",
    types: ["tsf", "tlf"],
    skills: {},
    priority: "NORMAL",
    alarm: "dme",
  } as const;
  s.desk.aaos.push({ ...aao, types: [...aao.types] });
  propose(s, m, s.desk.aaos[0], "developer");
  alarm(s, m, [...m.control!.proposal!.vehicles], "developer");
  expect(m.telemetry!.aaos).toEqual([{ id, name: aao.name, sufficient: true }]);
  expect(() =>
    alarm(
      s,
      m,
      s.vehicles.map((v) => v.id),
      "developer",
    ),
  ).toThrow();
  expect(m.telemetry!.aaos).toHaveLength(1);
  m.control!.radio.push({
    id: "additional-request",
    vehicle: s.vehicles[0].id,
    reason: "request",
    priority: "NORMAL",
    state: "handled",
    created: s.time,
    answered: s.time,
    details: "Zusatzkraft",
  });
  // Only the aggregation is isolated here; the actual completion path is tested above.
  m.phase = "done";
  m.completed = s.time + 100;
  finalizeReport(s, m);
  finalizeReport(s, m);
  expect(s.statistics.requests).toBe(1);
  expect(s.statistics.aaos[`aao:${id}`]).toEqual({
    name: aao.name,
    uses: 1,
    sufficient: 1,
  });
  expect(() => validate(s)).not.toThrow();
});

it("Labor steuert Wetter, Uhrzeit, Gefahren, Fahrzeugdefekt, FMS und Patienten nur in seiner reproduzierbaren Kopie", () => {
  let lab = createLab(124);
  const step = (a: unknown) => {
    lab = runLab(lab, a);
  };
  step({ type: "crew-ready" });
  step({ type: "weather", kind: "fog" });
  expect(lab.save.environment!.visibility).toBe(150);
  step({ type: "generate", template: "bin" });
  const id = lab.save.missions[0].id;
  step({ type: "interview", mission: id });
  step({
    type: "dispatch",
    mission: id,
    vehicles: lab.save.vehicles.map((v) => v.id),
  });
  step({
    type: "advance",
    seconds:
      Math.ceil(
        Math.max(...lab.save.vehicles.map((v) => v.depart)) - lab.save.time,
      ) + 1,
  });
  const vehicle = lab.save.vehicles[0].id;
  expect(lab.save.environment!.visibility).toBe(150);
  step({ type: "damage", vehicle });
  expect(lab.save.desk.fleet[vehicle].code).toBe(6);
  step({ type: "repair", vehicle });
  expect(lab.save.vehicles[0].fault!.state).toBe("repairing");
  step({ type: "escalate", mission: id });
  expect(
    lab.save.missions[0].dynamics!.hazards.every((h) => h.value >= 85),
  ).toBe(true);
  step({ type: "generate", template: "crash" });
  const m = lab.save.missions[1],
    patient = m.dynamics!.patients[0].id;
  step({ type: "patient", mission: m.id, patient, health: 0 });
  expect(lab.save.missions[1].dynamics!.patients[0].condition).toBe("dead");
  step({ type: "patient", mission: m.id, patient, health: 80 });
  expect(lab.save.missions[1].dynamics!.patients[0].condition).toBe("stable");
  step({ type: "generate", template: "bin" });
  expect(lab.save.missions.length).toBeGreaterThan(2);
  step({ type: "clock", hour: 1 });
  expect(lab.save.time % 86400).toBeCloseTo(3600, 8);
  step({ type: "fms", vehicle, code: 5 });
  expect(lab.save.desk.fleet[vehicle].code).toBe(5);
  expect(verifyLab(lab).verified).toBe(true);
});

it("Serverrhythmus bleibt unregelmäßig, begrenzt wartende Vorgänge und vermeidet Nachholstau", async () => {
  expect(
    new Set(Array.from({ length: 500 }, (_, seed) => nextCallDelay(seed))).size,
  ).toBeGreaterThan(60);
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase5-cadence-")),
    db = new Database(dir);
  try {
    const owner = await new Auth(db).create(
      "cadence",
      "Phase-five-cadence-123!",
      "Nord",
      "Nord",
    );
    const s = createLab(124).save;
    s.player.id = owner;
    for (const o of [...s.buildings, ...s.vehicles]) o.owner = owner;
    s.missionWait = 1;
    db.save(owner, s);
    const game = new Game(db, () => true);
    game.step(3600);
    expect(db.all().get(owner)!.missions).toHaveLength(0);
    const after = db.all().get(owner)!,
      delay = after.missionWait;
    expect(delay).toBeGreaterThanOrEqual(20);
    expect(delay).toBeLessThanOrEqual(360);
    for (let seconds = 0; seconds < delay - 1; seconds++) game.step(1);
    expect(db.all().get(owner)!.missions).toHaveLength(0);
    game.step(1);
    expect(db.all().get(owner)!.missions).toHaveLength(1);
    for (let seconds = 0; seconds < 500; seconds += 10) game.step(10);
    expect(db.all().get(owner)!.missions.length).toBeGreaterThan(1);
    const ids = db
      .all()
      .get(owner)!
      .missions.map((m) => m.id);
    game.step(14400);
    expect(
      db
        .all()
        .get(owner)!
        .missions.map((m) => m.id),
    ).toEqual(ids);
  } finally {
    db.close();
  }
}, 20000);
