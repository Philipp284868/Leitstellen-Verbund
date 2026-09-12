import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveConfiguration } from "../../scripts/configuration.mjs";
import { inspectInstallation } from "../../scripts/installation-storage.mjs";
import { initialize, instance } from "./instance.mjs";
import { atomic, lock, safePath, within } from "./files.mjs";
import { snapshot } from "./database.mjs";

export async function adopt(root, source) {
  source = safePath(source);
  root = safePath(root);
  const old = resolveConfiguration({ programRoot: source, environment: {} });
  if (!old.identity)
    throw Error(
      "Belegte alte Installationsidentität fehlt. Pfade zuerst prüfen.",
    );
  inspectInstallation(old);
  const oldData = safePath(old.settings.DATA_DIR),
    geo = safePath(old.settings.GEODATA_DIR);
  if (
    within(root, source) ||
    within(source, root) ||
    within(root, oldData) ||
    within(oldData, root) ||
    within(oldData, geo) ||
    within(geo, oldData)
  )
    throw Error(
      "Alte Installation, Daten, Geodaten und neue Instanz müssen getrennt liegen.",
    );
  const marker = resolve(old.settings.DATA_DIR, "managed-instance.json");
  if (existsSync(marker))
    throw Error(
      "Alte Installation wurde bereits übernommen. Keine zweite aktive Kopie.",
    );
  const release = lock(resolve(old.settings.DATA_DIR, "server.lock"), "adopt");
  try {
    if (existsSync(resolve(root, "shared/state/instance.json")))
      throw Error(
        "Zielinstanz bereits eingerichtet. Keine automatische Übernahme.",
      );
    const i = initialize(root, old.settings, {
      id: old.identity.id,
      geodata: old.settings.GEODATA_DIR,
    });
    // A interrupted adoption must never look like a fresh, uninitialized world.
    atomic(resolve(i.state, "instance.json"), {
      ...i.record,
      initialized: true,
      requiresReset: true,
    });
    const saved = await snapshot(
      resolve(old.settings.DATA_DIR, "game.sqlite"),
      resolve(i.data, "game.sqlite"),
    );
    const db = new DatabaseSync(resolve(i.data, "game.sqlite"));
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare(
        "INSERT OR REPLACE INTO meta(key,value) VALUES('instance-generation',?)",
      ).run(i.record.generation);
      db.prepare(
        "INSERT OR REPLACE INTO meta(key,value) VALUES('instance-id',?)",
      ).run(i.record.id);
      db.exec("COMMIT");
    } finally {
      db.close();
    }
    atomic(resolve(i.data, "world.json"), {
      instance: i.record.id,
      generation: i.record.generation,
    });
    atomic(resolve(i.state, "adoption.json"), {
      source,
      sourceData: old.settings.DATA_DIR,
      sourceIdentity: old.identity.id,
      instance: i.record.id,
      status: "awaiting-confirmed-reset",
      snapshot: saved,
    });
    atomic(marker, {
      root: i.root,
      id: i.record.id,
      reason: "Nur verwaltete Instanz verwenden. Alter Start gesperrt.",
    });
    atomic(resolve(i.state, "instance.json"), {
      ...i.record,
      initialized: true,
      requiresReset: true,
    });
    console.log(
      "Vorhandene Konfiguration und Geodaten zugeordnet. Alter Spielstand gesichert übernommen; separater bestätigter Reset erforderlich.",
    );
    return instance(root);
  } finally {
    release();
  }
}
