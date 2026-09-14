import { saveIndependentFixture } from "./helpers/independent-sites";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { ServerAction } from "../src/server/actions";
import { Auth } from "../src/server/auth";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { organizationFixture } from "./mutual-aid-fixture";

it("nimmt den Helferabzug trotz fehlender Restabdeckung an und gibt den fremden Einsatz nicht auf", async () => {
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
    saveIndependentFixture(db, helper, assisting);
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
    const scene = db.all().get(owner)!;
    const commandVehicle = arrived.vehicles[0];
    scene.missions[0].major = {
      kind: "fire",
      declared: scene.time,
      level: 1,
      sections: [
        {
          kind: "command",
          ordered: true,
          priority: 1,
          progress: 0,
          seconds: 30,
          done: false,
          leader: {
            vehicle: commandVehicle.id,
            assignment: commandVehicle.assignment!,
          },
        },
      ],
      placements: [
        {
          vehicle: commandVehicle.id,
          assignment: commandVehicle.assignment!,
          section: "command",
        },
      ],
      transports: false,
      evacuated: 0,
      evacuees: 0,
      water: 0,
      demand: 0,
      shortage: "",
      campaign: "",
    };
    db.save(owner, scene);
    command(helper, { type: "aid-close", owner, id: request.id, op: "done" });
    expect(db.all().get(owner)!.aid[0].state).toBe("DONE");
    expect(
      db
        .all()
        .get(helper)!
        .vehicles.every((v) => v.status === "return" && !v.mission),
    ).toBe(true);
    expect(db.all().get(owner)!.missions[0].outcome).toBeUndefined();
    expect(db.all().get(owner)!.missions[0].major!.placements).toEqual([]);
    expect(
      db.all().get(owner)!.missions[0].major!.sections[0].leader,
    ).toBeUndefined();
    const after = structuredClone(db.all().get(helper)!.vehicles);
    command(helper, { type: "aid-close", owner, id: request.id, op: "done" });
    expect(db.all().get(helper)!.vehicles).toEqual(after);
  } finally {
    db.close();
  }
});
