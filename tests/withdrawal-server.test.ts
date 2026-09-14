import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Auth } from "../src/server/auth";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { attachDynamics } from "../src/simulation/dynamics";
import { phaseFixture } from "./dispatch-fixture";
import { atScene } from "./incident-dynamics-fixture";

it("nur eigene oder verwaltete Einsätze aufgeben; Ergebnis, Rückkehr und Nullvergütung bleiben über Neustart idempotent", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-abandon-server-"));
  let db = new Database(dir);
  try {
    const auth = new Auth(db),
      owner = await auth.create(
        "abandon-owner",
        "abandon-password-123!",
        "Nord",
        "Nord",
      ),
      other = await auth.create(
        "abandon-other",
        "abandon-password-123!",
        "Süd",
        "Süd",
      ),
      member = await auth.create(
        "abandon-member",
        "abandon-password-123!",
        "Disponent",
        "Nord",
      );
    db.sql.prepare("INSERT INTO desk_members VALUES (?,?)").run(member, owner);
    const s = phaseFixture(owner, "bin"),
      m = s.missions[0];
    attachDynamics(s, m);
    for (const v of s.vehicles) atScene(s, v, m.id);
    db.save(owner, s);
    let game = new Game(db);
    const cmd = {
      id: crypto.randomUUID(),
      action: { type: "abandon-incident", mission: m.id },
    };
    expect(() => game.command(other, cmd)).toThrow(/Eigener laufender Einsatz/);
    game.command(member, cmd);
    const ended = db.all().get(owner)!;
    expect(ended.missions[0].outcome).toMatchObject({
      result: "abandoned",
      actor: member,
      trigger: "player",
    });
    expect(ended.vehicles.every((v) => v.status === "return")).toBe(true);
    game.command(member, cmd);
    game.command(member, { ...cmd, id: crypto.randomUUID() });
    expect(db.all().get(owner)!.money).toBe(s.money);
    expect(db.all().get(owner)!.xp).toBe(s.xp);
    db.close();
    db = new Database(dir);
    game = new Game(db);
    game.command(member, cmd);
    for (let n = 0; n < 9; n++)
      game.step(60, Date.now(), { generation: false, sharedSituation: false });
    const final = db.all().get(owner)!;
    expect(final.statistics.abandoned).toBe(1);
    expect(final.money).toBe(s.money);
    expect(final.xp).toBe(s.xp);
    expect(final.archive.find((x) => x.id === m.id)!.outcome!.result).toBe(
      "abandoned",
    );
    game.command(member, cmd);
    expect(db.all().get(owner)).toEqual(final);
  } finally {
    db.close();
  }
});

it("prüft gemeinsamen Kräfteabzug erneut in der Transaktion, verweigert Fremdzugriff und erhält Replay nach Neustart", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-withdraw-server-"));
  let db = new Database(dir);
  try {
    const auth = new Auth(db);
    const owner = await auth.create(
      "withdraw-owner",
      "withdraw-secure-password",
      "Owner",
      "Nord",
    );
    const member = await auth.create(
      "withdraw-member",
      "withdraw-secure-password",
      "Member",
      "Nord",
    );
    const other = await auth.create(
      "withdraw-other",
      "withdraw-secure-password",
      "Other",
      "Süd",
    );
    db.sql.prepare("INSERT INTO desk_members VALUES (?,?)").run(member, owner);
    const s = phaseFixture(owner, "bin"),
      m = s.missions[0];
    attachDynamics(s, m);
    m.control!.briefed = true;
    for (const v of s.vehicles) atScene(s, v, m.id);
    db.save(owner, s);
    let game = new Game(db);
    const first = {
      id: crypto.randomUUID(),
      action: { type: "withdraw", mission: m.id, vehicles: [s.vehicles[0].id] },
    };
    expect(() => game.command(other, first)).toThrow(
      /Eigener laufender Einsatz/,
    );
    expect(
      db
        .all()
        .get(owner)!
        .vehicles.every((v) => v.status === "scene"),
    ).toBe(true);
    game.command(owner, first);
    const after = db.all().get(owner)!;
    expect(after.vehicles[0].status).toBe("return");
    expect(after.desk.fleet[after.vehicles[0].id].code).toBe(1);
    expect(() =>
      game.command(member, {
        id: crypto.randomUUID(),
        action: {
          type: "withdraw",
          mission: m.id,
          vehicles: [s.vehicles[1].id],
        },
      }),
    ).not.toThrow();
    expect(() =>
      game.command(member, {
        id: crypto.randomUUID(),
        action: { type: "recall", id: s.vehicles[1].id },
      }),
    ).not.toThrow();
    expect(
      db
        .all()
        .get(owner)!
        .vehicles.every((v) => v.status === "return"),
    ).toBe(true);
    expect(db.all().get(owner)!.missions[0].outcome).toBeUndefined();
    expect(db.all().get(owner)!.money).toBe(s.money);
    db.close();
    db = new Database(dir);
    game = new Game(db);
    const persisted = db.all().get(owner)!;
    game.command(owner, first);
    expect(db.all().get(owner)).toEqual(persisted);
    expect(
      persisted.missions[0].control!.events.filter(
        (e) => e.type === "FORCES_WITHDRAWN",
      ),
    ).toHaveLength(2);
    expect(persisted.vehicles[0].mission).toBeNull();
  } finally {
    db.close();
  }
});
