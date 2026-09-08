import { xpForLevel } from "../src/progression";
import { expect, it } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { organizationFixture, addAmbulance } from "./phase-three-fixture";
import {
  organizationCommand,
  organizationsTick,
  organizationsComplete,
  attachOrganizations,
} from "../src/simulation/organizations";
import {
  personDuty,
  personAvailable,
  crewRequired,
} from "../src/simulation/staffing";
import { publicSave } from "../src/simulation/incidents";
import { alarm } from "../src/simulation/dispatch";
import { hospitalOptions } from "../src/simulation/hospitals";
import { apply, tick, readiness, hospital } from "../src/engine";
import { validate } from "../src/model";
import { nodes } from "../src/world";
import { Database, DATABASE_VERSION } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import type { ServerAction } from "../server/actions";
import { breakVehicle } from "../src/simulation/faults";
const password = "phase-three-password-123!";
async function world() {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-phase3-")),
    db = new Database(dir),
    auth = new Auth(db);
  const owner = await auth.create("owner", password, "Nord", "Nord"),
    helper = await auth.create("helper", password, "Süd", "Süd"),
    other = await auth.create("other", password, "West", "West");
  db.save(owner, organizationFixture(owner));
  db.save(helper, organizationFixture(helper, "field", "south"));
  const game = new Game(db);
  const command = (user: string, action: ServerAction) =>
    game.command(user, { id: crypto.randomUUID(), action });
  const draft = (types = ["hlf", "tlf"]) => {
    command(owner, {
      type: "aid-draft",
      peer: helper,
      mission: db.all().get(owner)!.missions[0].id,
      types,
      message: "Löschunterstützung benötigt",
      priority: "DRINGEND",
    });
    return db.all().get(owner)!.aid.at(-1)!;
  };
  return { dir, db, owner, helper, other, game, command, draft };
}
it("BF und Führungsfahrzeuge nutzen konfigurierte Ausrückzeiten ohne Tageszeitabzug", () => {
  const s = organizationFixture("bf"),
    v = s.vehicles[0],
    b = s.buildings[0];
  organizationCommand(
    s,
    {
      type: "station-profile",
      home: b.id,
      profile: { kind: "bf", turnout: 30, crew: "normal", reserve: 0 },
    },
    "bf",
  );
  alarm(s, s.missions[0], [v.id], "bf");
  expect(v.depart - s.time).toBe(30);
  tick(s, s.time + 29, {}, false, false);
  expect(v.status).toBe("alarmed");
  tick(s, s.time + 1, {}, false, false);
  expect(v.status).toBe("travel");
  expect(s.desk.fleet[v.id].code).toBe(3);
  expect(() =>
    organizationCommand(
      s,
      {
        type: "station-profile",
        home: b.id,
        profile: { ...b.organization!, turnout: 31 },
      },
      "bf",
    ),
  ).toThrow("zurückgekehrtem");
  organizationCommand(
    s,
    {
      type: "station-profile",
      home: b.id,
      profile: { ...b.organization!, reserve: 1 },
    },
    "bf",
  );
  expect(readiness(s, s.vehicles[1])).toContain("Gebietsreserve");
  organizationCommand(
    s,
    {
      type: "station-profile",
      home: b.id,
      profile: { ...b.organization!, reserve: 0 },
    },
    "bf",
  );
  expect(readiness(s, s.vehicles[1])).toBe("");
});
it("FF-Anreise ist individuell, reproduzierbar und nach Speichern unverändert", () => {
  const s = organizationFixture("ff"),
    v = s.vehicles[0];
  s.buildings[0].organization = {
    kind: "ff",
    turnout: 30,
    crew: "minimum",
    reserve: 0,
  };
  const crew = s.people.filter((p) => p.vehicle === v.id);
  for (const [i, p] of crew.entries())
    p.duty = {
      ...personDuty(s, p),
      homeNode: i,
      workNode: i,
      reachability: i < 3 ? 100 : 0,
      workdays: false,
    };
  const clone = validate(structuredClone(s));
  alarm(s, s.missions[0], [v.id], "ff");
  alarm(clone, clone.missions[0], [v.id], "ff");
  expect(clone).toEqual(s);
  expect(new Set(v.turnout!.arrivals.map((a) => a.at)).size).toBeGreaterThan(1);
  expect(v.depart - s.time).toBeGreaterThan(30);
  const loaded = validate(JSON.parse(JSON.stringify(s)));
  for (let i = 0; i < 100; i++) {
    tick(s, s.time + 5, {}, false, false);
    tick(loaded, loaded.time + 5, {}, false, false);
  }
  expect(loaded).toEqual(s);
  expect(v.status).not.toBe("alarmed");
  expect(s.people.filter((p) => p.duty?.load)).toHaveLength(3);
});
it("ausbleibende FF-Quittierung verhindert Ausrücken und fordert Ersatz an", () => {
  const s = organizationFixture("ff-fail"),
    v = s.vehicles[0];
  s.buildings[0].organization = {
    kind: "ff",
    turnout: 30,
    crew: "normal",
    reserve: 0,
  };
  for (const p of s.people.filter((p) => p.vehicle === v.id))
    p.duty = { ...personDuty(s, p), reachability: 1 };
  alarm(s, s.missions[0], [v.id], "ff-fail");
  expect(v.turnout!.arrivals.filter((a) => a.available).length).toBeLessThan(9);
  tick(s, s.time + 601, {}, false, false);
  expect(v.mission).toBeNull();
  expect(v.status).not.toBe("scene");
  expect(
    s.missions[0].control!.radio.some((r) =>
      r.details.includes("Personal fehlt"),
    ),
  ).toBe(true);
});
it("Schicht, Abwesenheit und Reserve verhindern Disposition; Umbesetzung nutzt wirklich eigenes geeignetes Personal", () => {
  const s = organizationFixture("staff"),
    [from, to] = s.vehicles;
  const ambulance = addAmbulance(s),
    p = s.people.find((p) => p.vehicle === ambulance.id)!;
  p.duty = { ...personDuty(s, p), shift: "day" };
  expect(personAvailable(s, p)).toContain("Schicht");
  p.duty.standby = true;
  expect(personAvailable(s, p)).toBe("");
  p.duty.absence = "vacation";
  p.duty.until = s.time + 10;
  expect(readiness(s, ambulance)).toContain("Besatzung");
  s.time += 11;
  expect(personAvailable(s, p)).toBe("");
  organizationCommand(
    s,
    { type: "vehicle-reserve", vehicle: from.id, reserve: true },
    "staff",
  );
  expect(readiness(s, from)).toContain("Reserve");
  expect(() => alarm(s, s.missions[0], [from.id], "staff")).toThrow("Reserve");
  apply(s, { type: "unassign", vehicle: to.id });
  s.people
    .filter((p) => p.vehicle === from.id)
    .slice(3)
    .forEach((p) => (p.duty = { ...personDuty(s, p), absence: "ill" }));
  organizationCommand(
    s,
    { type: "crew-transfer", from: from.id, to: to.id },
    "staff",
  );
  expect(s.people.filter((p) => p.vehicle === from.id)).toHaveLength(0);
  expect(s.people.filter((p) => p.vehicle === to.id)).toHaveLength(3);
  expect(crewRequired(s, to)).toBe(3);
  expect(readiness(s, to)).toBe("");
});
it("Polizeisicherung schützt Rettungskräfte; THW-Aufträge brauchen echte Fähigkeiten", () => {
  const s = organizationFixture("tasks"),
    m = s.missions[0];
  m.control!.briefed = true;
  m.organization = {
    tasks: ["secure", "shore", "power", "triage"].map((kind) => ({
      kind: kind as "secure" | "shore" | "power" | "triage",
      ordered: false,
      progress: 0,
      seconds: 30,
      done: false,
    })),
  };
  const skills = {
    medical: 2,
    doctor: 1,
    technical: 3,
    logistics: 2,
    police: 0,
  };
  organizationsTick(s, m, skills, 30);
  expect(skills.medical).toBe(0);
  expect(organizationsComplete(m)).toBe(false);
  for (const t of m.organization.tasks)
    organizationCommand(
      s,
      { type: "organization-task", mission: m.id, task: t.kind },
      "tasks",
    );
  organizationsTick(s, m, { medical: 2, technical: 3, logistics: 2 }, 60);
  expect(m.organization.tasks.every((t) => t.progress === 0)).toBe(true);
  organizationsTick(
    s,
    m,
    { police: 2, medical: 2, technical: 3, logistics: 2 },
    30,
  );
  expect(organizationsComplete(m)).toBe(true);
  expect(
    m.control!.events.filter((e) => e.type === "ORGANIZATION_TASK_DONE"),
  ).toHaveLength(4);
});
it("Krankenhäuser lehnen ungeeignete Patienten ab, reservieren Betten und lenken zum geeigneten Ziel um", () => {
  const s = organizationFixture("hospital", "sick"),
    v = addAmbulance(s),
    m = s.missions[0];
  s.money += 100000;
  s.xp = xpForLevel(30);
  apply(s, { type: "build", kind: "hospital", pos: nodes[30] });
  tick(s, s.time + 30, {}, false, false);
  const b = s.buildings.at(-1)!;
  organizationCommand(
    s,
    {
      type: "hospital-profile",
      home: b.id,
      profile: { open: true, capacity: 1, specialties: ["general"] },
    },
    "hospital",
  );
  m.dynamics!.patients[0].age = 10;
  m.organization!.hospital = b.id;
  expect(
    hospitalOptions(s, m.pos, 1, m, v).find((h) => h.id === b.id)!.reason,
  ).toContain("Kinderheilkunde");
  expect(hospital(s, m.pos, 1, m, v)!.id).toBe("public");
  b.hospital!.specialties.push("pediatric");
  expect(hospital(s, m.pos, 1, m, v)!.id).toBe(b.id);
  v.status = "transport";
  v.path = [m.pos, b.pos];
  v.destination = b.id;
  v.patients = 1;
  expect(
    hospitalOptions(s, m.pos, 1, m, v).find((h) => h.id === b.id)!.reserved,
  ).toBe(1);
  expect(hospital(s, m.pos, 1, m, v)!.id).toBe("public");
});
it("Entwürfe sind privat; Versand gewährt nur der Ziel-Leitstelle die Anfrage; Fremdzugriff und Solo sind gesperrt", async () => {
  const w = await world();
  try {
    const r = w.draft();
    expect(w.game.view(w.helper, new Set()).network.requests).toHaveLength(0);
    w.command(w.owner, { type: "aid-send", id: r.id });
    expect(w.game.view(w.helper, new Set()).network.requests).toHaveLength(1);
    expect(w.game.view(w.helper, new Set()).network.friends).toHaveLength(0);
    expect(w.game.view(w.other, new Set()).network.requests).toHaveLength(0);
    expect(() =>
      w.command(w.other, {
        type: "aid-message",
        owner: w.owner,
        id: r.id,
        text: "Fremd",
      }),
    ).toThrow("zugänglich");
    expect(() =>
      w.command(w.owner, {
        type: "aid-accept",
        owner: w.owner,
        id: r.id,
        vehicles: [w.db.all().get(w.owner)!.vehicles[0].id],
      }),
    ).toThrow("angefragte");

    expect(() =>
      w.game.command(
        w.owner,
        { id: crypto.randomUUID(), action: { type: "aid-send", id: r.id } },
        "single" as never,
      ),
    ).toThrow("Multiplayer");
    expect(() => w.game.view(w.owner, new Set(), "single" as never)).toThrow(
      "Multiplayer",
    );
  } finally {
    w.db.close();
  }
});
it("Rückfragen, Teilannahme, Idempotenz, exakte Fahrzeugbindung und Rückruf funktionieren ohne allgemeine Freigabe", async () => {
  const w = await world();
  try {
    const r = w.draft(),
      helper = w.db.all().get(w.helper)!;
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-message",
      owner: w.owner,
      id: r.id,
      text: "Zunächst ein HLF, reicht das?",
    });
    const accept = {
      id: crypto.randomUUID(),
      action: {
        type: "aid-accept" as const,
        owner: w.owner,
        id: r.id,
        vehicles: [helper.vehicles[0].id],
      },
    };
    w.game.command(w.helper, accept);
    w.game.command(w.helper, accept);
    expect(w.db.all().get(w.owner)!.aid[0].assignments).toHaveLength(1);
    expect(() =>
      w.game.command(w.helper, { ...accept, id: crypto.randomUUID() }),
    ).toThrow();
    expect(() =>
      w.game.command(w.helper, {
        ...accept,
        action: { ...accept.action, vehicles: [helper.vehicles[1].id] },
      }),
    ).toThrow("andere Aktion");
    expect(w.game.view(w.other, new Set()).network.friends).toHaveLength(0);
    const visible = w.game.view(w.owner, new Set()).network.friends;
    expect(visible[0].vehicles).toHaveLength(1);
    expect(visible[0].missions).toHaveLength(0);
    expect(w.db.all().get(w.owner)!.missions[0].shared).toBe(false);
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: [helper.vehicles[1].id],
    });
    expect(w.db.all().get(w.owner)!.aid[0].assignments).toHaveLength(2);
    w.command(w.owner, {
      type: "aid-close",
      owner: w.owner,
      id: r.id,
      op: "cancel",
    });
    expect(w.game.view(w.owner, new Set()).network.friends).toHaveLength(0);
    expect(
      w.db
        .all()
        .get(w.helper)!
        .vehicles.every((v) => v.mission === null),
    ).toBe(true);
  } finally {
    w.db.close();
  }
});
it("abgelehnte und zurückgezogene Anfragen können nicht erneut angenommen werden", async () => {
  const w = await world();
  try {
    for (const op of ["decline", "cancel"] as const) {
      const r = w.draft();
      w.command(w.owner, { type: "aid-send", id: r.id });
      w.command(op === "decline" ? w.helper : w.owner, {
        type: "aid-close",
        owner: w.owner,
        id: r.id,
        op,
      });
      expect(() =>
        w.command(w.helper, {
          type: "aid-accept",
          owner: w.owner,
          id: r.id,
          vehicles: [w.db.all().get(w.helper)!.vehicles[0].id],
        }),
      ).toThrow("beendet");
    }
  } finally {
    w.db.close();
  }
});
it("Nachbarhilfe erledigt Erkundung, dynamischen Brand und Belohnung über Serverneustart ohne Helferbrowser", async () => {
  const w = await world();
  let db = w.db;
  try {
    const r = w.draft();
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: db
        .all()
        .get(w.helper)!
        .vehicles.map((v) => v.id),
    });
    w.game.step(120);
    let m = db.all().get(w.owner)!.missions[0];
    expect(m.control!.radio.some((r) => r.reason === "arrival")).toBe(true);
    w.command(w.owner, {
      type: "radio",
      mission: m.id,
      id: m.control!.radio.find((r) => r.reason === "arrival")!.id,
      op: "report",
    });
    const before = db.all().get(w.helper)!.money;
    db.close();
    db = new Database(w.dir);
    const game = new Game(db);
    for (
      let n = 0;
      n < 180 &&
      db
        .all()
        .get(w.owner)!
        .missions.some((m) => m.id === r.mission);
      n++
    )
      game.step(5);
    const s = db.all().get(w.owner)!;
    m = s.archive.find((m) => m.id === r.mission)!;
    expect(m).toBeDefined();
    expect(m.shared).toBe(false);
    expect(m.dynamics!.state).toBe("resolved");
    expect(s.aid[0].state).toBe("DONE");
    expect(db.all().get(w.helper)!.money).toBeGreaterThan(before);
    const paid = db.all().get(w.helper)!.money;
    game.step(60);
    expect(db.all().get(w.helper)!.money).toBe(paid);
    expect(
      db.sql
        .prepare("SELECT COUNT(*) AS n FROM rewards WHERE id=?")
        .get(`coop:${m.round}:${w.helper}`)!.n,
    ).toBe(1);
  } finally {
    db.close();
  }
});
it("fremder RTW versorgt und transportiert einzelne Patienten; kein Rückruf oder Abschluss während Transport", async () => {
  const w = await world();
  try {
    const owner = organizationFixture(w.owner, "sick"),
      helper = organizationFixture(w.helper, "field", "south"),
      ambulance = addAmbulance(helper);
    owner.time = helper.time;
    owner.missions[0].dynamics!.last = owner.time;
    owner.missions[0].control!.briefed = true;
    owner.missions[0].dynamics!.patients[0].age = 30;
    owner.missions[0].dynamics!.patients[0].health = 95;
    w.db.save(w.owner, owner);
    w.db.save(w.helper, helper);
    w.command(w.owner, {
      type: "organization-task",
      mission: owner.missions[0].id,
      task: "triage",
    });
    const r = w.draft(["rtw"]);
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: [ambulance.id],
    });
    let aboard = false;
    for (let n = 0; n < 200; n++) {
      w.game.step(5);
      const m = w.db
        .all()
        .get(w.owner)!
        .missions.find((m) => m.id === r.mission);
      if (m?.dynamics!.patients[0].transport === "aboard") {
        aboard = true;
        break;
      }
    }
    expect(aboard).toBe(true);
    expect(() =>
      w.command(w.owner, {
        type: "aid-close",
        owner: w.owner,
        id: r.id,
        op: "cancel",
      }),
    ).toThrow("Patiententransport");
    for (
      let n = 0;
      n < 400 &&
      w.db
        .all()
        .get(w.owner)!
        .missions.some((m) => m.id === r.mission);
      n++
    )
      w.game.step(5);
    const done = w.db
      .all()
      .get(w.owner)!
      .archive.find((m) => m.id === r.mission)!;
    expect(done).toBeDefined();
    expect(done.dynamics!.patients[0].transport).toBe("delivered");
    expect(
      done.dynamics!.patients[0].history.some((h) =>
        h.text.includes("Krankenhaus"),
      ),
    ).toBe(true);
    expect(done.transports).toHaveLength(1);
    expect(done.transports[0].owner).toBe(w.helper);
  } finally {
    w.db.close();
  }
});
it("berechtigte Disponenten bearbeiten Anfragen derselben Leitstelle; Rechteentzug greift sofort", async () => {
  const w = await world();
  try {
    w.command(w.helper, { type: "member-invite", username: "other" });
    w.command(w.other, { type: "member-accept", owner: w.helper });
    const r = w.draft();
    w.command(w.owner, { type: "aid-send", id: r.id });
    expect(w.game.view(w.other, new Set()).network.requests).toHaveLength(1);
    w.command(w.other, {
      type: "aid-message",
      owner: w.owner,
      id: r.id,
      text: "Disponent antwortet",
    });
    w.command(w.helper, { type: "member-remove", user: w.other });
    expect(w.game.view(w.other, new Set()).network.requests).toHaveLength(0);
    expect(() =>
      w.command(w.other, {
        type: "aid-message",
        owner: w.owner,
        id: r.id,
        text: "Nicht erlaubt",
      }),
    ).toThrow("zugänglich");
  } finally {
    w.db.close();
  }
});
it("Migration 7→8 erhält beide Welten samt laufender Alarmierung byteinhaltlich und sichert die Originaldaten", async () => {
  const w = await world();
  let db = w.db;
  try {
    const s = db.all().get(w.owner)!;
    alarm(s, s.missions[0], [s.vehicles[0].id], w.owner);
    db.save(w.owner, s);
    db.save(w.owner, s, "single");
    const raw = String(
      db.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(w.owner)!
        .data,
    );
    db.sql.exec("PRAGMA user_version=7");
    db.close();
    db = new Database(w.dir);
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    expect(JSON.stringify(db.all().get(w.owner))).toBe(raw);
    expect(JSON.stringify(db.all("single").get(w.owner))).toBe(raw);
    const file = (await readdir(w.dir)).find((f) =>
      f.startsWith("pre-migration-v2-"),
    )!;
    const backup = new DatabaseSync(resolve(w.dir, file), { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get()!.user_version).toBe(7);
    expect(
      backup.prepare("SELECT data FROM saves WHERE user_id=?").get(w.owner)!
        .data,
    ).toBe(raw);
    backup.close();
  } finally {
    db.close();
  }
});
it("Organisationsaufträge verraten vor der Erkundung weder verdeckte Polizei- noch Patientendaten", () => {
  const s = organizationFixture("hidden", "sick"),
    m = s.missions[0];
  attachOrganizations(m);
  expect(m.organization!.tasks.length).toBeGreaterThan(0);
  expect(publicSave(s).missions[0]).not.toHaveProperty("organization");
});
it("Gebietsreserve gilt auch für Mehrfachauswahl; abgelehnte Teilaktionen hinterlassen keine Bindung", async () => {
  const w = await world();
  try {
    const s = w.db.all().get(w.helper)!;
    s.buildings[0].organization = {
      kind: "bf",
      turnout: 30,
      crew: "normal",
      reserve: 1,
    };
    w.db.save(w.helper, s);
    expect(() =>
      alarm(
        s,
        s.missions[0],
        s.vehicles.map((v) => v.id),
        w.helper,
      ),
    ).toThrow("Gebietsreserve");
    expect(s.vehicles.every((v) => v.status === "ready")).toBe(true);
    const r = w.draft();
    w.command(w.owner, { type: "aid-send", id: r.id });
    const before = w.db.all().get(w.helper)!;
    expect(() =>
      w.command(w.helper, {
        type: "aid-accept",
        owner: w.owner,
        id: r.id,
        vehicles: before.vehicles.map((v) => v.id),
      }),
    ).toThrow("Gebietsreserve");
    expect(w.db.all().get(w.helper)).toEqual(before);
    expect(w.db.all().get(w.owner)!.aid[0].assignments).toEqual([]);
  } finally {
    w.db.close();
  }
});
it("fremde Defekte liefern keine Fähigkeiten und erzeugen einen Sprechwunsch beim anfragenden Disponenten", async () => {
  const w = await world();
  try {
    const r = w.draft(["hlf"]);
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: [w.db.all().get(w.helper)!.vehicles[0].id],
    });
    w.game.step(120);
    const s = w.db.all().get(w.helper)!,
      v = s.vehicles[0];
    breakVehicle(s, v, "equipment");
    w.db.save(w.helper, s);
    w.game.step(5);
    const m = w.db.all().get(w.owner)!.missions[0];
    expect(
      m.control!.radio.some((r) =>
        r.details.includes("Nachbarleitstelle ausgefallen"),
      ),
    ).toBe(true);
    expect(
      w.game.view(w.owner, new Set()).network.friends[0].vehicles[0].fms,
    ).toBe(6);
    expect(m.progress).toBe(0);
    const assignment = v.assignment;
    w.command(w.helper, { type: "repair", vehicle: v.id });
    w.game.step(125);
    const repaired = w.db
      .all()
      .get(w.helper)!
      .vehicles.find((x) => x.id === v.id)!;
    expect(repaired.fault!.state).toBe("repaired");
    expect(repaired.assignment).toBe(assignment);
    expect(repaired.mission).toBe(`remote:${w.owner}:${m.id}`);
    expect(repaired.status).toBe("scene");
  } finally {
    w.db.close();
  }
});
it("aktive Unterstützungsanfrage übersteht echte CLI-Wiederherstellung und spielt deterministisch weiter", async () => {
  const w = await world();
  let restored: Database | undefined;
  try {
    const r = w.draft();
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: w.db
        .all()
        .get(w.helper)!
        .vehicles.map((v) => v.id),
    });
    const original = w.db.all().get(w.owner)!;
    original.missions[0].control!.briefed = true;
    w.db.save(w.owner, original);
    const file = await w.db.backup(),
      dir = await mkdtemp(resolve(tmpdir(), "lv-aid-restore-"));
    const result = spawnSync(
      process.execPath,
      ["dist/server/cli.js", "restore", "--file", file, "--confirm"],
      { encoding: "utf8", env: { ...process.env, DATA_DIR: dir } },
    );
    expect(result.status, result.stderr).toBe(0);
    restored = new Database(dir);
    const game = new Game(restored);
    expect(restored.all()).toEqual(w.db.all());
    for (let i = 0; i < 100; i++) {
      w.game.step(5, 2000000 + i * 5000);
      game.step(5, 2000000 + i * 5000);
    }
    expect(restored.all()).toEqual(w.db.all());
    expect(
      restored.sql.prepare("SELECT * FROM rewards ORDER BY id").all(),
    ).toEqual(w.db.sql.prepare("SELECT * FROM rewards ORDER BY id").all());
  } finally {
    restored?.close();
    w.db.close();
  }
});
it("historischer Schema-7-Stand ohne Phase-3-Felder erhält keine nachträglichen Organisationspflichten", async () => {
  const w = await world();
  let db = w.db;
  try {
    const s = db.all().get(w.owner)!;
    delete s.missions[0].organization;
    alarm(s, s.missions[0], [s.vehicles[0].id], w.owner);
    delete s.vehicles[0].turnout;
    const old = JSON.parse(JSON.stringify(s));
    delete old.aid;
    const raw = JSON.stringify(old);
    for (const table of ["saves", "solo_saves"])
      db.sql
        .prepare(
          `INSERT INTO ${table} VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data`,
        )
        .run(w.owner, raw);
    db.sql.exec("PRAGMA user_version=7");
    db.close();
    db = new Database(w.dir);
    for (const mode of ["multi", "single"] as const) {
      const migrated = db.all(mode).get(w.owner)!;
      expect(migrated).toEqual({ ...old, aid: [] });
      expect(migrated.missions[0].organization).toBeUndefined();
      expect(migrated.vehicles[0].turnout).toBeUndefined();
    }
    const file = (await readdir(w.dir)).find((f) =>
      f.startsWith("pre-migration-v2-"),
    )!;
    const backup = new DatabaseSync(resolve(w.dir, file), { readOnly: true });
    expect(
      backup.prepare("SELECT data FROM saves WHERE user_id=?").get(w.owner)!
        .data,
    ).toBe(raw);
    backup.close();
  } finally {
    db.close();
  }
});
it("erste Nachbarkräfte melden Fehlbedarf, FMS folgt dem Funkgespräch und AAO zählt später zugesagte Kräfte mit", async () => {
  const w = await world();
  try {
    const r = w.draft(),
      vehicles = w.db.all().get(w.helper)!.vehicles;
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: [vehicles[0].id],
    });
    w.game.step(120);
    let m = w.db.all().get(w.owner)!.missions[0];
    w.command(w.owner, {
      type: "radio",
      mission: m.id,
      id: m.control!.radio.find((r) => r.reason === "arrival")!.id,
      op: "report",
    });
    w.game.step(5);
    m = w.db.all().get(w.owner)!.missions[0];
    const deficit = m.control!.radio.find(
      (r) => r.state === "open" && r.details.startsWith("Nachforderung:"),
    )!;
    expect(deficit.details).toContain("Löschwasser");
    expect(w.db.all().get(w.helper)!.desk.fleet[vehicles[0].id].code).toBe(5);
    w.command(w.owner, {
      type: "radio",
      mission: m.id,
      id: deficit.id,
      op: "request",
    });
    w.game.step(1);
    expect(w.db.all().get(w.helper)!.desk.fleet[vehicles[0].id].code).toBe(4);
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: [vehicles[1].id],
    });
    w.game.step(100);
    w.command(w.owner, {
      type: "aao-save",
      aao: {
        id: "remaining",
        name: "Restbedarf",
        keyword: "Restbedarf",
        level: 1,
        org: "Alle",
        types: ["tlf"],
        skills: {},
        priority: "NORMAL",
        alarm: "dme",
      },
    });
    w.command(w.owner, {
      type: "aao-propose",
      mission: m.id,
      aao: "remaining",
    });
    expect(
      w.db.all().get(w.owner)!.missions[0].control!.proposal!.missing,
    ).toEqual([]);
  } finally {
    w.db.close();
  }
});
it("mehrere FMS-Meldungen zwischen zwei Ticks bleiben im fremden Einsatzverlauf erhalten", async () => {
  const w = await world();
  try {
    const r = w.draft(["hlf"]),
      vehicle = w.db.all().get(w.helper)!.vehicles[0].id;
    w.command(w.owner, { type: "aid-send", id: r.id });
    w.command(w.helper, {
      type: "aid-accept",
      owner: w.owner,
      id: r.id,
      vehicles: [vehicle],
    });
    w.command(w.helper, {
      type: "fms",
      vehicle,
      code: 0,
      reason: "Dringende Rückfrage aus dem Fahrzeug",
    });
    w.command(w.helper, {
      type: "fms",
      vehicle,
      code: 5,
      reason: "Normale Rückfrage aus dem Fahrzeug",
    });
    w.game.step(1);
    const entries = w.db
      .all()
      .get(w.owner)!
      .missions[0].control!.events.filter((e) => e.type === "AID_FMS");
    expect(
      entries.some((e) =>
        e.text.includes("Dringende Rückfrage aus dem Fahrzeug"),
      ),
    ).toBe(true);
    expect(
      entries.some((e) =>
        e.text.includes("Normale Rückfrage aus dem Fahrzeug"),
      ),
    ).toBe(true);
    expect(entries.every((e) => !!e.assignment)).toBe(true);
  } finally {
    w.db.close();
  }
});
