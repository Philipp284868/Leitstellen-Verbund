import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { ServerAction } from "../server/actions";
import { Auth } from "../server/auth";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { atScene } from "./incident-dynamics-fixture";
import { organizationFixture } from "./mutual-aid-fixture";

it("verhindert den gesamten Helferabzug über Anfrageende und Abbruch bis Ersatzkräfte die Besitzerlage decken", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-aid-withdraw-"));
  const db = new Database(dir);
  try {
    const auth = new Auth(db);
    const owner = await auth.create(
      "aid-owner",
      "withdrawal-password-123!",
      "Nord",
      "Nord",
    );
    const helper = await auth.create(
      "aid-helper",
      "withdrawal-password-123!",
      "Süd",
      "Süd",
    );
    const owned = organizationFixture(owner, "bin", "owner"),
      assisting = organizationFixture(helper, "bin", "helper");
    owned.missions[0].control!.briefed = true;
    db.save(owner, owned);
    db.save(helper, assisting);
    const game = new Game(db);
    const command = (who: string, action: ServerAction) =>
      game.command(who, { id: crypto.randomUUID(), action });
    command(owner, {
      type: "aid-draft",
      peer: helper,
      mission: owned.missions[0].id,
      types: ["hlf", "tlf"],
      message: "Löschunterstützung",
      priority: "NORMAL",
    });
    const request = db.all().get(owner)!.aid[0];
    command(owner, { type: "aid-send", id: request.id });
    command(helper, {
      type: "aid-accept",
      owner,
      id: request.id,
      vehicles: assisting.vehicles.map((v) => v.id),
    });
    const arrived = db.all().get(helper)!;
    for (const v of arrived.vehicles) {
      v.status = "scene";
      v.arrive = arrived.time;
      v.depart = arrived.time;
      v.path = [owned.missions[0].pos];
    }
    db.save(helper, arrived);
    const before = [...db.all()].map(([id, save]) => [
      id,
      JSON.stringify(save),
    ]);
    expect(() =>
      command(helper, { type: "aid-close", owner, id: request.id, op: "done" }),
    ).toThrow(/Löschmittel/);
    expect(() =>
      command(owner, {
        type: "aid-close",
        owner,
        id: request.id,
        op: "cancel",
      }),
    ).toThrow(/Löschmittel/);
    expect(
      [...db.all()].map(([id, save]) => [id, JSON.stringify(save)]),
    ).toEqual(before);
    const replacement = db.all().get(owner)!;
    atScene(replacement, replacement.vehicles[1], replacement.missions[0].id);
    db.save(owner, replacement);
    command(helper, { type: "aid-close", owner, id: request.id, op: "done" });
    expect(db.all().get(owner)!.aid[0].state).toBe("DONE");
    expect(
      db
        .all()
        .get(helper)!
        .vehicles.every((v) => v.status === "return" && !v.mission),
    ).toBe(true);
    expect(db.all().get(owner)!.vehicles[1].status).toBe("scene");
  } finally {
    db.close();
  }
});
