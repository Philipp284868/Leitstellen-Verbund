import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import { prepared } from "./patient-transport";
import { installLogicGeography } from "../fixtures/germany/logic-provider";

/** Setup-only fixture outside the archive. All transport decisions, rewards and
 * database writes execute in the exact packaged server, with a controlled clock. */
export async function packagedTransport(
  file: string,
  config: Config,
  generation: string,
) {
  const product = (await import(
    pathToFileURL(file).href
  )) as typeof import("../../src/server/index");
  let app = product.startServer(
    config,
    undefined,
    await product.prepareGeography(config),
  );
  try {
    const step = app.game.step.bind(app.game);
    app.game.step = () => {};
    const owner = await app.auth.create(
      "patientcheck",
      randomBytes(24).toString("base64url"),
      "Transportprüfung",
      "Paketleitstelle",
    );
    installLogicGeography();
    const { s, m } = prepared(1, 1, owner);
    s.generation = generation;
    app.db.save(owner, s);
    const startingMoney = s.money,
      startingXp = s.xp;
    step(1, Date.now(), { generation: false });
    const aboard = app.db.all().get(owner)!.missions[0].dynamics!.patients;
    assert.equal(aboard.filter((p) => p.transport === "aboard").length, 1);
    // Persist while a patient is aboard, then resume the same packaged module.
    await app.close();
    app = product.startServer(
      config,
      undefined,
      await product.prepareGeography(config),
    );
    const resumedStep = app.game.step.bind(app.game);
    app.game.step = () => {};
    for (
      let n = 0;
      n < 600 &&
      app.db
        .all()
        .get(owner)!
        .missions.some((x) => x.id === m.id);
      n++
    ) {
      resumedStep(5, Date.now(), { generation: false });
      await delay(2);
    }
    const done = app.db.all().get(owner)!;
    const archived = done.archive.find((x) => x.id === m.id);
    assert.ok(
      archived,
      "Paket muss Patiententransport abschließen und archivieren",
    );
    assert.equal(archived.dynamics!.patients[0].transport, "delivered");
    assert.equal(archived.transports.length, 1);
    assert.ok(done.money > startingMoney, "Einsatzvergütung gebucht");
    assert.ok(done.xp > startingXp, "Einsatzfortschritt gebucht");
    resumedStep(10, Date.now(), { generation: false });
    assert.equal(app.db.all().get(owner)!.money, done.money);
    await app.close();
    app = product.startServer(
      config,
      undefined,
      await product.prepareGeography(config),
    );
    const persisted = app.db.all().get(owner)!;
    assert.equal(persisted.money, done.money);
    assert.equal(persisted.xp, done.xp);
    assert.equal(persisted.archive.filter((x) => x.id === m.id).length, 1);
  } finally {
    await app.close();
  }
}
