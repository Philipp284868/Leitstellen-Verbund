import { emsProfile } from "./e2e/fixtures";
import { attachIncident } from "../src/simulation/calls";
import { readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { apply } from "../src/engine";
import { AudioEvents } from "../src/audio/events";
import { expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Database } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import { validate } from "../src/model";
import { tick, readiness } from "../src/engine";
import { phaseFixture } from "./phase-fixture";
import { callAction, callsTick } from "../src/simulation/calls";
import { alarm, propose } from "../src/simulation/dispatch";
import { radioAction, publicSave } from "../src/simulation/incidents";
import { setFms } from "../src/simulation/fms";
import type { AAO } from "../src/simulation/schema";
const aao: AAO = {
  id: "aao-test",
  name: "Kleinbrand",
  keyword: "B1",
  level: 1,
  org: "Feuerwehr",
  types: ["hlf"],
  skills: { fire: 1 },
  priority: "PRIORITÄT",
  alarm: "station",
};
function interview(s: ReturnType<typeof phaseFixture>, actor = s.player.id) {
  const m = s.missions[0],
    c = m.control!.calls[0];
  callAction(s, m, c.id, "accept", actor);
  callAction(s, m, c.id, "ask", actor, "address");
  tick(s, s.time + 5, {}, false, false);
  callAction(s, m, c.id, "ask", actor, "report");
  callAction(s, m, c.id, "end", actor);
}
it("spielt Notruf, AAO, HLF, FMS, Lagemeldung, Nachforderung, TLF und Archiv deterministisch durch", () => {
  const base = phaseFixture("owner");
  function replay() {
    const s = structuredClone(base),
      m = s.missions[0],
      hlf = s.vehicles[0],
      tlf = s.vehicles[1];
    expect(publicSave(s).missions[0].template).toBe("incoming");
    expect(publicSave(s).missions[0].pos).toEqual({ x: 0, y: 0 });
    expect(JSON.stringify(publicSave(s))).not.toContain('"secret"');
    expect(() => alarm(s, m, [hlf.id], "owner")).toThrow("Ort und Meldebild");
    interview(s);
    expect(publicSave(s).missions[0].template).toBe("bin");
    propose(s, m, aao, "owner");
    expect(m.control!.proposal!.vehicles).toEqual([hlf.id]);
    expect(hlf.status).toBe("ready");
    alarm(s, m, [hlf.id], "owner", aao.priority, aao.alarm);
    expect(hlf.status).toBe("alarmed");
    expect(hlf.depart - s.time).toBe(30);
    tick(s, hlf.depart, {}, false, false);
    expect(hlf.status).toBe("travel");
    expect(s.desk.fleet[hlf.id].code).toBe(3);
    const route = structuredClone(hlf.path),
      assignment = hlf.assignment;
    setFms(s, hlf, 0, "owner", "Priorisierter Funkkontakt");
    expect(readiness(s, hlf)).toContain("gebunden");
    expect(hlf.assignment).toBe(assignment);
    expect(hlf.path).toEqual(route);
    tick(s, hlf.arrive + 1, {}, false, false);
    expect(hlf.status).toBe("scene");
    expect(m.progress).toBe(0);
    expect(
      s.desk.fleet[hlf.id].history.some((e) => e.text.startsWith("FMS 4:")),
    ).toBe(true);
    expect(m.control!.radio[0].priority).toBe("PRIORITÄT");
    radioAction(s, m, m.control!.radio[0].id, "report", "owner");
    expect(publicSave(s).missions[0].template).toBe("field");
    tick(s, s.time + 1, {}, false, false);
    const request = m.control!.radio.find((r) => r.reason === "request")!;
    expect(request.details).toContain("Löschwasser");
    radioAction(s, m, request.id, "request", "owner");
    const count = m.control!.events.length;
    radioAction(s, m, request.id, "request", "owner");
    expect(m.control!.events).toHaveLength(count);
    alarm(s, m, [tlf.id], "owner", "DRINGEND", "siren");
    expect(tlf.depart - s.time).toBe(45);
    const before = s.money;
    tick(s, tlf.arrive + 70, {}, false, false);
    expect(s.archive.find((x) => x.id === m.id)?.control?.stage).toBe("closed");
    expect(s.money - before).toBe(14000);
    const done = s.archive[0];
    expect(done.control!.events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        "CALL_RECEIVED",
        "CALL_ACCEPTED",
        "CALL_UPDATED",
        "AAO_PROPOSED",
        "ALARM_STARTED",
        "VEHICLE_DEPARTED",
        "VEHICLE_ARRIVED",
        "FMS_CHANGED",
        "REPORT_RECEIVED",
        "REINFORCEMENT_REQUESTED",
        "MISSION_COMPLETED",
      ]),
    );
    const reward = s.money;
    tick(s, s.time + 2000, {}, false, false);
    expect(s.money).toBe(reward);
    expect(s.vehicles.every((v) => v.status === "ready")).toBe(true);
    expect(validate(s)).toEqual(s);
    return s;
  }
  expect(replay()).toEqual(replay());
});
it("ordnet mehrere Anrufe demselben Ereignis zu; Abbruch, Rückruf und Übernahme erhalten Angaben", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  callAction(s, m, c.id, "accept", "owner");
  callAction(s, m, c.id, "ask", "owner", "report");
  expect(() => callAction(s, m, c.id, "ask", "owner", "people")).toThrow(
    "antwortet",
  );
  expect(() => callAction(s, m, c.id, "accept", "member")).toThrow(
    "bearbeitet",
  );
  tick(s, s.time + 36, {}, false, false);
  expect(c.state).toBe("dropped");
  callAction(s, m, c.id, "callback", "member");
  expect(c.asked).toEqual(["report"]);
  tick(s, s.time + 10, {}, false, false);
  expect(m.control!.calls).toHaveLength(2);
  expect(s.missions).toHaveLength(1);
  callAction(s, m, c.id, "ask", "member", "calm");
  expect(c.stress).toBeLessThan(60);
  tick(s, s.time + 66, {}, false, false);
  callAction(s, m, c.id, "accept", "owner");
  expect(c.actor).toBe("owner");
  const second = m.control!.calls[1];
  callAction(s, m, second.id, "accept", "member");
  callAction(s, m, second.id, "ask", "member", "report");
  tick(s, s.time + 5, {}, false, false);
  callAction(s, m, second.id, "ask", "member", "people");
  expect(s.missions).toHaveLength(1);
  expect(validate(s)).toEqual(s);
});
it("liefert einen Folgeanruf wenn ein unvollständiges Gespräch ohne Rückruf abbricht", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  c.callback = false;
  c.stress = 90;
  m.control!.secret!.secondaryAt = 0;
  callAction(s, m, c.id, "accept", "owner");
  tick(s, s.time + 40, {}, false, false);
  expect(c.state).toBe("dropped");
  tick(s, s.time + 35, {}, false, false);
  expect(m.control!.calls[1].state).toBe("ringing");
  callsTick(s);
  expect(m.control!.calls).toHaveLength(2);
});
it("AAO und freie Disposition respektieren Sperren, Fehlbedarf und Wachenprofile", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    v = s.vehicles[0];
  interview(s);
  setFms(s, v, 6, "owner", "Wartungsarbeit");
  propose(s, m, aao, "owner");
  expect(m.control!.proposal!.vehicles).toEqual([]);
  expect(m.control!.proposal!.missing.join()).toContain("HLF");
  expect(() => alarm(s, m, [v.id], "owner")).toThrow("FMS 6");
  setFms(s, v, 2, "owner", "Wieder verfügbar");
  s.desk.alarms[v.home] = "station";
  alarm(s, m, [v.id, v.id], "owner");
  expect(v.depart - s.time).toBe(30);
  expect(
    m.control!.events.filter((e) => e.type === "ALARM_STARTED"),
  ).toHaveLength(1);
  expect(() => alarm(s, m, [s.vehicles[1].id, v.id], "owner")).toThrow(
    "gebunden",
  );
  expect(s.vehicles[1].mission).toBeNull();
});
it("speichert AAO, Gespräche, Fahrt und Historie über Neustart; schützt fremde und doppelte Aktionen", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase-one-"));
  let db = new Database(dir);
  try {
    const auth = new Auth(db),
      owner = await auth.create(
        "owner",
        "Phase-one-password-123!",
        "Owner",
        "Nord",
      ),
      member = await auth.create(
        "member",
        "Phase-one-password-123!",
        "Member",
        "Süd",
      ),
      other = await auth.create(
        "other",
        "Phase-one-password-123!",
        "Other",
        "West",
      );
    db.save(owner, phaseFixture(owner));
    let game = new Game(db);
    const cmd = (who: string, action: unknown) =>
      game.command(who, { id: crypto.randomUUID(), action });
    const m = db.all().get(owner)!.missions[0],
      call = m.control!.calls[0].id;
    expect(game.view(other, new Set()).network.friends).toEqual([]);
    expect(() =>
      cmd(other, { type: "call", mission: m.id, call, op: "accept" }),
    ).toThrow("Eigener");
    expect(() => cmd(owner, { type: "share", id: m.id })).toThrow(
      "eigenen Leitstelle",
    );
    expect(() => cmd(member, { type: "member-accept", owner })).toThrow(
      "Einladung",
    );
    const oldMember = db.all().get(member)!;
    game.view(member, new Set(), "single");
    const solo = db.all("single").get(member)!;
    cmd(owner, { type: "member-invite", username: "member" });
    cmd(member, { type: "member-accept", owner });
    expect(game.view(member, new Set()).save).toEqual(
      game.view(owner, new Set()).save,
    );
    cmd(owner, { type: "call", mission: m.id, call, op: "accept" });
    expect(() =>
      cmd(member, {
        type: "call",
        mission: m.id,
        call,
        op: "ask",
        question: "address",
      }),
    ).toThrow("Gesprächsbearbeiter");
    cmd(owner, {
      type: "call",
      mission: m.id,
      call,
      op: "ask",
      question: "address",
    });
    game.step(5);
    cmd(owner, {
      type: "call",
      mission: m.id,
      call,
      op: "ask",
      question: "report",
    });
    cmd(owner, { type: "call", mission: m.id, call, op: "end" });
    cmd(member, { type: "aao-save", aao });
    cmd(member, { type: "aao-propose", mission: m.id, aao: aao.id });
    const dispatch = {
      id: crypto.randomUUID(),
      action: {
        type: "dispatch",
        mission: m.id,
        vehicles: [db.all().get(owner)!.vehicles[0].id],
      },
    };
    game.command(member, dispatch);
    game.command(member, dispatch);
    expect(() =>
      game.command(owner, { ...dispatch, id: crypto.randomUUID() }),
    ).toThrow("gebunden");
    const prior = db.all().get(owner)!;
    db.close();
    db = new Database(dir);
    game = new Game(db);
    expect(db.all().get(owner)).toEqual(prior);
    game.command(member, dispatch);
    expect(db.all().get(owner)).toEqual(prior);
    expect(
      game.view(member, new Set()).save.missions[0].control!.secret,
    ).toBeUndefined();
    game.step(61);
    expect(db.all().get(owner)!.vehicles[0].status).toBe("travel");
    cmd(owner, { type: "member-remove", user: member });
    expect(game.view(member, new Set()).workspace.owner).toBe(member);
    expect(() =>
      cmd(member, { type: "aao-propose", mission: m.id, aao: aao.id }),
    ).toThrow("Eigener");
    expect(db.all().get(member)!.money).toBe(oldMember.money);
    expect(db.all("single").get(member)!.money).toBe(solo.money);
  } finally {
    db.close();
  }
});

it("migriert einen echten Schema-5-Bestand mit aktiver Anfahrt ohne Vermögens- oder Auftragsverlust", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase-migration-"));
  let db = new Database(dir);
  try {
    const owner = await new Auth(db).create(
      "migrate",
      "Migration-phase-password!",
      "Migration",
      "Nord",
    );
    const legacy = phaseFixture(owner);
    delete legacy.missions[0].control;
    legacy.missions[0].shared = true;
    apply(legacy, {
      type: "dispatch",
      mission: legacy.missions[0].id,
      vehicles: [legacy.vehicles[0].id],
    });
    const raw = JSON.parse(JSON.stringify(legacy));
    delete raw.desk;
    raw.templates = [{ name: "Alte Löschvorlage", types: ["hlf", "tlf"] }];
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(raw), owner);
    db.sql.exec(
      "DROP TABLE desk_members; DROP TABLE desk_invites; PRAGMA user_version=5",
    );
    db.close();
    db = new Database(dir);
    const migrated = db.all().get(owner)!;
    expect(migrated.money).toBe(legacy.money);
    expect(migrated.vehicles).toEqual(legacy.vehicles);
    expect(migrated.player).toEqual(legacy.player);
    expect(migrated.missions[0].control!.legacy).toBe(true);
    expect(migrated.missions[0].shared).toBe(false);
    expect(migrated.desk.aaos[0].types).toEqual(["hlf", "tlf"]);
    expect(migrated.desk.fleet[legacy.vehicles[0].id].code).toBe(3);
    const backups = (await readdir(dir)).filter((f) =>
      f.startsWith("pre-migration-v2"),
    );
    expect(backups).toHaveLength(1);
    const backup = new DatabaseSync(resolve(dir, backups[0]), {
      readOnly: true,
    });
    try {
      expect(
        JSON.parse(
          String(
            backup.prepare("SELECT data FROM saves WHERE user_id=?").get(owner)!
              .data,
          ),
        ),
      ).toEqual(raw);
    } finally {
      backup.close();
    }
    const game = new Game(db);
    game.command(owner, {
      id: crypto.randomUUID(),
      action: {
        type: "dispatch",
        mission: migrated.missions[0].id,
        vehicles: [migrated.vehicles[1].id],
      },
    });
    game.step(3000);
    expect(
      db
        .all()
        .get(owner)!
        .archive.some((m) => m.id === legacy.missions[0].id),
    ).toBe(true);
  } finally {
    db.close();
  }
});
it("spielt Profilklänge und neue Kommunikationsereignisse nur einmal nach bestätigter Änderung", () => {
  for (const profile of ["dme", "siren", "station"] as const) {
    const s = phaseFixture("owner");
    interview(s);
    const events = new AudioEvents();
    expect(events.observe(structuredClone(s), "multi", true)).toBeNull();
    alarm(s, s.missions[0], [s.vehicles[0].id], "owner", "NORMAL", profile);
    s.revision++;
    expect(events.observe(structuredClone(s), "multi", true)).toBe(profile);
    expect(events.observe(structuredClone(s), "multi", true)).toBeNull();
    events.reset();
    expect(events.observe(s, "multi", true)).toBeNull();
  }
});

it("erhält den Patiententransport im neuen Ablauf mit FMS 7, 8 und einmaligem Abschluss", () => {
  const s = emsProfile("Rettung"),
    m = s.missions[0];
  attachIncident(s, m);
  interview(s);
  const v = s.vehicles.find((v) => v.type === "rtw")!;
  alarm(s, m, [v.id], s.player.id);
  tick(s, v.arrive + 1, {}, false, false);
  radioAction(s, m, m.control!.radio[0].id, "report", s.player.id);
  tick(s, s.time + 5000, {}, false, false);
  expect(s.archive.some((a) => a.id === m.id)).toBe(true);
  for (const code of [3, 4, 5, 7, 8, 1, 2])
    expect(
      s.desk.fleet[v.id].history.some((e) => e.text.startsWith(`FMS ${code}:`)),
    ).toBe(true);
  expect(m.transports[0].status).toBe("delivered");
  expect(
    m.control!.events.filter((e) => e.type === "MISSION_COMPLETED"),
  ).toHaveLength(1);
  expect(validate(s)).toEqual(s);
});
it("hält widersprüchliche Angaben verschiedener Anrufer als Widerspruch fest", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    c = m.control!.calls[0];
  callAction(s, m, c.id, "accept", "owner");
  callAction(s, m, c.id, "ask", "owner", "report");
  tick(s, s.time + 5, {}, false, false);
  callAction(s, m, c.id, "ask", "owner", "people");
  callAction(s, m, c.id, "end", "owner");
  tick(s, s.time + 45, {}, false, false);
  const second = m.control!.calls[1];
  callAction(s, m, second.id, "accept", "owner");
  callAction(s, m, second.id, "ask", "owner", "report");
  tick(s, s.time + 5, {}, false, false);
  callAction(s, m, second.id, "ask", "owner", "people");
  expect(
    m.control!.facts.filter((f) => f.key === "people").at(-1)!.confidence,
  ).toBe("widersprüchlich");
  expect(m.control!.facts.filter((f) => f.key === "people")).toHaveLength(2);
});
it("Rückruf vor dem Ausrücken startet an der Wache und teleportiert nicht zur Einsatzstelle", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0],
    v = s.vehicles[0];
  interview(s);
  alarm(s, m, [v.id], "owner");
  apply(s, { type: "recall", id: v.id });
  expect(v.path[0]).toEqual(s.buildings[0].pos);
  expect(v.mission).toBeNull();
  expect(v.arrive - s.time).toBe(3);
});
