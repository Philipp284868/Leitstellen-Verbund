import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Auth } from "../server/auth";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { attachDynamics } from "../src/simulation/dynamics";
import { phaseFixture } from "./dispatch-fixture";
import { atScene } from "./incident-dynamics-fixture";

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
    const all = {
      id: crypto.randomUUID(),
      action: {
        type: "withdraw",
        mission: m.id,
        vehicles: s.vehicles.map((v) => v.id),
      },
    };
    expect(() => game.command(other, first)).toThrow(
      /Eigener laufender Einsatz/,
    );
    expect(() => game.command(owner, all)).toThrow(/Löschmittel/);
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
    ).toThrow(/Löschmittel/);
    expect(() =>
      game.command(member, {
        id: crypto.randomUUID(),
        action: { type: "recall", id: s.vehicles[1].id },
      }),
    ).toThrow(/Löschmittel/);
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
    ).toHaveLength(1);
    expect(persisted.vehicles[0].mission).toBeNull();
  } finally {
    db.close();
  }
});
