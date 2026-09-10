import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../server/config";
import { Database, DATABASE_VERSION } from "../server/database";
import type { Mission } from "../src/model";
import { postIncidentTick } from "../src/simulation/post-incident";
import {
  newStationProfile,
  personDuty,
  stationProfile,
} from "../src/simulation/staffing";
import { startServer } from "./fixtures/germany/server";
import "./fixtures/germany/session";
import { activeMissionsFixture, historyFixture } from "./history-fixture";

const password = "History-integration-password-284!";
const execute = promisify(execFile);
type Session = { cookie: string; csrf: string };
type HistoryPage = {
  total: number;
  page: number;
  pageSize: number;
  missions: Mission[];
};
const running: ReturnType<typeof startServer>[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) await app.close();
});
async function setup() {
  const c: Config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-history-http-")),
    secure: false,
    trustedProxies: [],
  };
  let app: ReturnType<typeof startServer>;
  async function start() {
    c.port = 0;
    app = startServer(c);
    running.push(app);
    await app.listen();
    const address = app.http.address();
    if (!address || typeof address === "string")
      throw Error("HTTP-Port fehlt.");
    c.publicUrl = `http://127.0.0.1:${address.port}`;
  }
  await start();
  const owner = await app!.auth.create(
    "history-north",
    password,
    "Nord",
    "Nord",
  );
  const other = await app!.auth.create("history-south", password, "Süd", "Süd");
  async function request(
    path: string,
    session?: Session,
    body?: unknown,
    mode = "multi",
  ) {
    return fetch(c.publicUrl + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: c.publicUrl,
        "Content-Type": "application/json",
        "X-Game-Mode": mode,
        ...(session
          ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function login(username: string): Promise<Session> {
    const response = await request("login", undefined, { username, password });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const me = await (await request("me", { cookie, csrf: "" })).json();
    return { cookie, csrf: me.csrf };
  }
  const session = await login("history-north"),
    foreign = await login("history-south");
  async function page(
    options = "",
    sessionToUse = session,
  ): Promise<HistoryPage> {
    const response = await request(`history?${options}`, sessionToUse);
    expect(response.status).toBe(200);
    return response.json();
  }
  async function action(sessionToUse: Session, actionBody: unknown) {
    const response = await request("action", sessionToUse, {
      id: crypto.randomUUID(),
      action: actionBody,
    });
    expect(response.status).toBe(200);
  }
  async function restart() {
    await app.close();
    running.splice(running.indexOf(app), 1);
    await start();
  }
  return {
    get app() {
      return app!;
    },
    c,
    owner,
    other,
    request,
    page,
    session,
    foreign,
    action,
    restart,
  };
}

describe("Persistentes Archiv über authentifizierte HTTP-Sitzungen", () => {
  it("exportiert über den echten Offline-CLI-Prozess alle Altberichte und überschreibt keine vorhandene Datei", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "lv-history-cli-"));
    const db = new Database(dir),
      owner = "cli-history-owner",
      other = "cli-history-other";
    for (const user of [owner, other])
      db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(user, user, "offline-test-password", "player", 0);
    const source = historyFixture(owner, 137),
      foreign = historyFixture(other, 111);
    source.missions = activeMissionsFixture(owner, 1).missions;
    source.buildings[0].organization = newStationProfile("fire");
    for (const p of source.people) p.duty = personDuty(source, p);
    db.save(owner, source, "single");
    db.save(other, foreign, "single");
    const before = db.sql
      .prepare("SELECT user_id,data FROM solo_saves ORDER BY user_id")
      .all();
    db.close();
    const cli = resolve("dist/server/cli.js");
    const file = resolve(dir, "archived-save.json");
    const options = {
      cwd: resolve("."),
      env: {
        ...process.env,
        DATA_DIR: dir,
        PORT: "7887",
        PUBLIC_URL: "http://127.0.0.1:7887",
        ALLOW_HTTP: "true",
      },
      timeout: 15000,
    };
    const args = [cli, "archive-export", "--username", owner, "--file", file];
    const result = await execute(process.execPath, args, options);
    expect(result.stdout).toContain("Archiv exportiert");
    const document = JSON.parse(await readFile(file, "utf8"));
    expect(document.save.archive.map((m: Mission) => m.id)).toEqual(
      source.archive.map((m) => m.id),
    );
    expect(document.save.seed).toBe(0);
    expect(document.save.people.every((p: { duty?: unknown }) => !p.duty)).toBe(
      true,
    );
    expect(document.save.missions[0].control.secret).toBeUndefined();
    expect(
      document.save.archive.every(
        (m: Mission) => !m.control?.secret && !m.major?.pending,
      ),
    ).toBe(true);
    const bytes = await readFile(file);
    await expect(execute(process.execPath, args, options)).rejects.toThrow();
    expect(await readFile(file)).toEqual(bytes);
    const after = new Database(dir);
    try {
      expect(
        after.sql
          .prepare("SELECT user_id,data FROM solo_saves ORDER BY user_id")
          .all(),
      ).toEqual(before);
      expect(
        after.sql.prepare("SELECT count(*) AS n FROM mission_history").get()!.n,
      ).toBe(248);
    } finally {
      after.close();
    }
  }, 20000);
  it("exportiert alle aktuellen und stillgelegten Berichte mit korrekter Kontoabgrenzung für Disponenten", async () => {
    const f = await setup();
    const current = historyFixture(f.owner, 537),
      foreign = historyFixture(f.other, 131);
    f.app.db.save(f.owner, current);
    f.app.db.save(f.other, foreign);
    const retired = historyFixture(f.owner, 137),
      retiredForeign = historyFixture(f.other, 129);
    for (const s of [retired, retiredForeign]) {
      for (const m of s.archive) m.id = `retired-${m.id}`;
      s.missions = activeMissionsFixture(s.player.id, 1).missions;
      s.buildings[0].organization = newStationProfile("fire");
      for (const p of s.people) p.duty = personDuty(s, p);
      f.app.db.save(s.player.id, s, "single");
    }
    expect(f.app.db.all().get(f.owner)!.archive).toHaveLength(100);
    expect(f.app.db.all("single").get(f.owner)!.archive).toHaveLength(100);
    async function exported(path: string, session = f.session) {
      const response = await f.request(path, session);
      expect(response.status).toBe(200);
      const document = await response.json();
      expect(
        document.save.archive.every(
          (m: Mission) =>
            !m.control?.secret &&
            !m.major?.pending &&
            m.dynamics?.random === undefined &&
            !m.dynamics?.pending,
        ),
      ).toBe(true);
      return document;
    }
    const own = await exported("export");
    expect(own.save.archive.map((m: Mission) => m.id)).toEqual(
      current.archive.map((m) => m.id),
    );
    expect(own.save.player.id).toBe(f.owner);
    expect(own.format).toBe("leitstellen-verbund");
    const archived = await exported("archive-export");
    expect(archived.save.archive.map((m: Mission) => m.id)).toEqual(
      retired.archive.map((m) => m.id),
    );
    expect(archived).toMatchObject({
      format: "leitstellen-verbund-archive",
      source: "retired-single-player",
    });
    expect(archived.save.seed).toBe(0);
    expect(archived.save.people.every((p: { duty?: unknown }) => !p.duty)).toBe(
      true,
    );
    expect(archived.save.missions[0].control.secret).toBeUndefined();
    expect(
      (await exported(`export?owner=${f.owner}`, f.foreign)).save.archive,
    ).toHaveLength(131);
    expect(
      (await exported(`archive-export?owner=${f.owner}`, f.foreign)).save
        .archive,
    ).toHaveLength(129);
    await f.action(f.session, {
      type: "member-invite",
      username: "history-south",
    });
    await f.action(f.foreign, { type: "member-accept", owner: f.owner });
    expect(
      (await exported("export", f.foreign)).save.archive.map(
        (m: Mission) => m.id,
      ),
    ).toEqual(current.archive.map((m) => m.id));
    // Retirement exports remain personal even while the account dispatches for another desk.
    const ownRetirement = await exported(
      `archive-export?owner=${f.owner}`,
      f.foreign,
    );
    expect(ownRetirement.save.player.id).toBe(f.other);
    expect(ownRetirement.save.archive.map((m: Mission) => m.id)).toEqual(
      retiredForeign.archive.map((m) => m.id),
    );
    await f.restart();
    expect((await exported("export", f.foreign)).save.archive).toHaveLength(
      537,
    );
    expect(
      (await exported("archive-export", f.foreign)).save.archive,
    ).toHaveLength(129);
    await f.action(f.session, { type: "member-remove", user: f.other });
    expect((await exported("export", f.foreign)).save.archive).toHaveLength(
      131,
    );
    for (const path of ["export", "archive-export"])
      expect((await f.request(path)).status).toBe(401);
  }, 20000);
  it("erhält den ältesten Bericht bis zum letzten Nachbereitungsereignis und aktualisiert dann das dauerhafte Archiv", async () => {
    const f = await setup(),
      s = historyFixture(f.owner, 137),
      oldest = s.archive.at(-1)!;
    s.vehicles[0].postIncident = {
      mission: oldest.id,
      queuedAt: s.time,
      startedAt: s.time,
      until: s.time + 30,
      current: 0,
      tasks: [{ kind: "cleaning", seconds: 30 }],
    };
    f.app.db.save(f.owner, s);
    const retained = f.app.db.all().get(f.owner)!;
    expect(retained.archive).toHaveLength(101);
    expect(retained.archive.at(-1)!.id).toBe(oldest.id);
    retained.time += 30;
    postIncidentTick(retained, retained.vehicles[0]);
    expect(retained.vehicles[0].postIncident).toBeUndefined();
    f.app.db.save(f.owner, retained);
    expect(f.app.db.all().get(f.owner)!.archive).toHaveLength(100);
    const report = (await f.page(`query=${oldest.id}`)).missions[0];
    expect(report.control!.events.map((event) => event.type)).toContain(
      "POST_INCIDENT_TASK_COMPLETED",
    );
    expect(report.control!.events.map((event) => event.type)).toContain(
      "VEHICLE_READY",
    );
    await f.restart();
    expect(
      (await f.page(`query=${oldest.id}`)).missions[0].control!.events,
    ).toEqual(report.control!.events);
  }, 15000);
  it("liefert sämtliche 537 Berichte ohne Dopplung, filtert serverseitig und überlebt Neustart", async () => {
    const f = await setup(),
      source = historyFixture(f.owner);
    f.app.db.save(f.owner, source);
    expect(f.app.db.all().get(f.owner)!.archive).toHaveLength(100);
    const ids: string[] = [];
    for (let page = 0; page < 22; page++) {
      const result = await f.page(`page=${page}`);
      expect(result).toMatchObject({ total: 537, page, pageSize: 25 });
      ids.push(...result.missions.map((m) => m.id));
      expect(
        result.missions.every(
          (m) =>
            !m.control?.secret &&
            m.dynamics?.random === undefined &&
            !m.dynamics?.pending &&
            !m.major?.pending,
        ),
      ).toBe(true);
    }
    expect(ids).toEqual(source.archive.map((m) => m.id));
    expect(new Set(ids).size).toBe(537);
    expect((await f.page("page=999999")).page).toBe(21);
    expect((await f.page("org=Rettungsdienst")).total).toBe(268);
    expect((await f.page("org=Feuerwehr")).total).toBe(269);
    expect((await f.page("major=true")).total).toBe(49);
    expect((await f.page("query=ARCHIV-SONDERFAHRZEUG")).total).toBe(54);
    expect((await f.page("query=%27%20OR%201%3D1%20--")).total).toBe(0);
    const target = source.archive.at(-1)!;
    const filtered = await f.page(`query=${encodeURIComponent(target.id)}`);
    expect(filtered.missions.map((m) => m.id)).toEqual([target.id]);
    expect(filtered.missions[0].control!.events[0].type).toBe(
      "MISSION_COMPLETED",
    );
    f.app.db.save(f.owner, f.app.db.all().get(f.owner)!);
    expect((await f.page()).total).toBe(537);
    await f.restart();
    expect((await f.page("page=21")).missions.map((m) => m.id)).toEqual(
      ids.slice(525),
    );
    expect((await f.page()).total).toBe(537);
  }, 20000);

  it("isoliert fremde Leitstellen und widerruft Archivzugriff nach Ende der Mitgliedschaft", async () => {
    const f = await setup();
    f.app.db.save(f.owner, historyFixture(f.owner, 3));
    f.app.db.save(f.other, historyFixture(f.other, 2));
    expect((await f.request("history")).status).toBe(401);
    expect(
      (
        await f.page(`owner=${f.owner}&user_id=${f.owner}`, f.foreign)
      ).missions.every((m) => m.id.includes(f.other)),
    ).toBe(true);
    await f.action(f.session, {
      type: "member-invite",
      username: "history-south",
    });
    expect((await f.page("", f.foreign)).total).toBe(2);
    await f.action(f.foreign, { type: "member-accept", owner: f.owner });
    expect((await f.page("", f.foreign)).missions.map((m) => m.id)).toEqual(
      (await f.page()).missions.map((m) => m.id),
    );
    await f.restart();
    expect((await f.page("", f.foreign)).total).toBe(3);
    await f.action(f.session, { type: "member-remove", user: f.other });
    expect((await f.page("", f.foreign)).total).toBe(2);
    expect((await f.page(`query=${f.owner}`, f.foreign)).total).toBe(0);
    expect(
      (await f.request("history", f.session, undefined, "single")).status,
    ).toBe(400);
    await f.request("logout", f.foreign, {});
    expect((await f.request("history", f.foreign)).status).toBe(401);
  }, 15000);

  it("weist ungültige Seiten und Filtergrößen zurück", async () => {
    const f = await setup();
    for (const query of [
      "page=-1",
      "page=1.5",
      "page=NaN",
      "page=1000001",
      `query=${"a".repeat(201)}`,
      `org=${"a".repeat(41)}`,
    ])
      expect((await f.request(`history?${query}`, f.session)).status).toBe(400);
    expect(await f.page()).toMatchObject({
      total: 0,
      page: 0,
      pageSize: 25,
      missions: [],
    });
  });

  it("alarmiert bereite Rückkehrer, akzeptiert aber keine manipulierte Availability oder FMS als Umgehung echter Nachbereitung", async () => {
    const f = await setup(),
      s = activeMissionsFixture(f.owner, 2),
      v = s.vehicles[0];
    v.status = "return";
    v.arrive = s.time + 100;
    v.depart = s.time;
    v.availability = {
      state: "AVAILABLE",
      alarmable: true,
      dispatchable: true,
      reason: "",
      crewPresent: 9,
      crewRequired: 9,
      crewCapacity: 9,
    };
    f.app.db.save(f.owner, s);
    expect(
      f.app.db.all().get(f.owner)!.vehicles[0].availability,
    ).toBeUndefined();
    await f.action(f.session, {
      type: "fms",
      vehicle: v.id,
      code: 2,
      reason: "Testmeldung bereit",
    });
    const dispatch = {
      type: "dispatch",
      mission: s.missions[0].id,
      vehicles: [v.id],
    };
    expect(
      (await (await f.request("me", f.session)).json()).save.vehicles[0]
        .availability,
    ).toMatchObject({ state: "RETURNING", alarmable: true });
    const dispatched = await f.request("action", f.session, {
      id: crypto.randomUUID(),
      action: dispatch,
    });
    expect(dispatched.status).toBe(200);
    const current = f.app.db.all().get(f.owner)!,
      recovering = current.vehicles[0];
    recovering.status = "ready";
    recovering.mission = null;
    recovering.assignment = null;
    recovering.path = [current.buildings[0].pos];
    delete recovering.journey;
    recovering.arrive = current.time;
    recovering.postIncident = {
      mission: "",
      queuedAt: current.time,
      tasks: [{ kind: "cleaning", seconds: 30 }],
      current: 0,
    };
    f.app.db.save(f.owner, current);
    const pending = await f.request("action", f.session, {
      id: crypto.randomUUID(),
      action: dispatch,
    });
    expect(pending.status).toBe(400);
    expect(await pending.text()).toContain("Reinigung");
    f.app.game.step(1, Date.now(), { generation: false });
    expect(
      f.app.db.all().get(f.owner)!.vehicles[0].postIncident!.startedAt,
    ).toBeDefined();
    await f.restart();
    expect(
      (await (await f.request("me", f.session)).json()).save.vehicles[0]
        .availability,
    ).toMatchObject({ state: "POST_INCIDENT", alarmable: false });
    f.app.game.step(31, Date.now(), { generation: false });
    expect(
      (await (await f.request("me", f.session)).json()).save.vehicles[0]
        .availability,
    ).toMatchObject({ state: "AVAILABLE", alarmable: true });
    const injection = await f.request("action", f.session, {
      id: crypto.randomUUID(),
      action: { ...dispatch, availability: v.availability },
    });
    expect(injection.status).toBe(400);
  }, 15000);

  it("migriert v12 mit unverändertem Vorher-Backup, BF-Bestand und allen alten Archiven", async () => {
    const f = await setup(),
      old = historyFixture(f.owner, 500);
    delete old.buildings[0].organization;
    const previous = JSON.stringify(old);
    f.app.db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(previous, f.owner);
    f.app.db.sql.exec("DROP TABLE mission_history; PRAGMA user_version=12;");
    await f.restart();
    expect(
      f.app.db.sql.prepare("PRAGMA user_version").get()!.user_version,
    ).toBe(DATABASE_VERSION);
    const migrated = f.app.db.all().get(f.owner)!;
    expect(migrated.buildings[0].organization).toBeUndefined();
    expect(stationProfile(migrated.buildings[0]).kind).toBe("bf");
    expect({
      money: migrated.money,
      xp: migrated.xp,
      world: migrated.world,
      vehicles: migrated.vehicles,
      people: migrated.people,
    }).toEqual({
      money: old.money,
      xp: old.xp,
      world: old.world,
      vehicles: old.vehicles,
      people: old.people,
    });
    expect((await f.page()).total).toBe(500);
    const backups = (await readdir(f.c.dataDir)).filter((name) =>
      name.startsWith("pre-migration-v2-"),
    );
    expect(backups).toHaveLength(1);
    const backup = new DatabaseSync(resolve(f.c.dataDir, backups[0]), {
      readOnly: true,
    });
    try {
      expect(backup.prepare("PRAGMA user_version").get()!.user_version).toBe(
        12,
      );
      expect(
        backup.prepare("SELECT data FROM saves WHERE user_id=?").get(f.owner)!
          .data,
      ).toBe(previous);
      expect(
        backup
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='mission_history'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      backup.close();
    }
    await f.restart();
    expect((await f.page()).total).toBe(500);
    expect(
      (await readdir(f.c.dataDir)).filter((name) =>
        name.startsWith("pre-migration-v2-"),
      ),
    ).toHaveLength(1);
  }, 20000);
});
