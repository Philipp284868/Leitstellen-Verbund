import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { alive, atomic, lock, read, unlock } from "./files.mjs";
import { instance, program, assertGeneration } from "./instance.mjs";
import { assertNoPendingReset } from "./reset.mjs";
import { acceptReady, rollbackBeforeReady, cleanup } from "./update.mjs";
import { inspect } from "./database.mjs";

export async function stopManaged(i) {
  const file = resolve(i.state, "operation.lock");
  if (!existsSync(file)) return;
  const owner = read(file);
  if (owner.action !== "start" || !alive(owner.pid))
    throw Error(
      "Instanz ist gesperrt. Diagnose bzw. ausdrückliche Entsperrung erforderlich.",
    );
  atomic(resolve(i.state, "stop.json"), { token: owner.token });
  for (let n = 0; n < 1600; n++) {
    if (!existsSync(file)) return;
    await delay(25);
  }
  throw Error(
    "Eigener Spielserver wurde nicht rechtzeitig beendet. Keine Daten verändert.",
  );
}
export async function start(root) {
  const i = instance(root);
  await assertNoPendingReset(i);
  assertGeneration(i);
  if (i.record.requiresReset)
    throw Error(
      "Übernahme vorbereitet. Separaten Reset mit Instanzbestätigung abschließen.",
    );
  const lease = resolve(i.state, "operation.lock"),
    release = lock(lease, "start");
  const token = randomUUID();
  let ready = false,
    timer;
  try {
    const details = inspect(resolve(i.data, "game.sqlite"));
    if (details.generation !== i.record.generation)
      throw Error("Datenbank gehört einer anderen Weltgeneration.");
    const folder = program(i);
    const build = read(resolve(folder, "release.json"));
    Object.assign(process.env, i.env, {
      LV_READY_TOKEN: token,
      LV_BUILD_COMMIT: build.commit,
    });
    // Only our own launcher processes this private, token-bound stop request.
    timer = setInterval(() => {
      const request = resolve(i.state, "stop.json");
      if (existsSync(request) && read(request).token === read(lease).token) {
        unlinkSync(request);
        process.emit("SIGTERM");
      }
    }, 100);
    const { runGermany } = await import(
      pathToFileURL(resolve(folder, "scripts/start-germany.mjs")).href
    );
    const code = await runGermany({
      programRoot: folder,
      onReady: async (message) => {
        if (
          message.token !== token ||
          message.commit !== build.commit ||
          message.instance !== i.record.id ||
          message.generation !== i.record.generation
        )
          throw Error(
            "Bereitschaft gehört nicht zur erwarteten Instanz/Version/Welt.",
          );
        acceptReady(i);
        ready = true;
      },
    });
    if (!ready) rollbackBeforeReady(i);
    if (ready && code === 0) cleanup(i);
    return code;
  } catch (error) {
    if (!ready) rollbackBeforeReady(i);
    throw error;
  } finally {
    clearInterval(timer);
    release();
  }
}
export function recoverLock(root) {
  const i = instance(root);
  unlock(resolve(i.state, "operation.lock"));
  unlock(resolve(i.data, "server.lock"));
  console.log(
    "Nur nachweislich verwaiste Sperren entfernt. Keine Spieldaten geändert.",
  );
}
