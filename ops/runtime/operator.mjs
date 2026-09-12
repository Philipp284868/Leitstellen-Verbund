import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { instance, assertGeneration } from "./instance.mjs";
import { lock, read } from "./files.mjs";
import { snapshot } from "./database.mjs";
import { randomUUID } from "node:crypto";
export async function grantOperator(root) {
  const i = instance(root);
  assertGeneration(i);
  const release = lock(resolve(i.state, "operation.lock"), "operator");
  try {
    const request = read(
      resolve(i.root, "shared/config/operator-request.json"),
    );
    if (
      request.confirm !== true ||
      request.instance !== i.record.id ||
      request.generation !== i.record.generation ||
      typeof request.username !== "string"
    )
      throw Error("Instanzbezogene Administratorbestätigung fehlt.");
    const dataUnlock = lock(resolve(i.data, "server.lock"), "operator");
    try {
      await snapshot(
        resolve(i.data, "game.sqlite"),
        resolve(
          i.root,
          "shared/backups/operator-" + randomUUID(),
          "game.sqlite",
        ),
      );
      const db = new DatabaseSync(resolve(i.data, "game.sqlite"));
      try {
        const user = db
          .prepare("SELECT id FROM users WHERE username=?")
          .get(request.username);
        if (!user)
          throw Error(
            "Registriertes Zielkonto fehlt. Kein Standardkonto erzeugt.",
          );
        db.prepare(
          "INSERT INTO game_operators(user_id,granted_at) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING",
        ).run(user.id, Date.now());
      } finally {
        db.close();
      }
    } finally {
      dataUnlock();
    }
  } finally {
    release();
  }
  console.log(
    "Registriertes Konto als Spieladministrator bestätigt. Passwort bleibt unverändert.",
  );
}
