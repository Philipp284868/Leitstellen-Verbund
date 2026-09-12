import { existsSync, renameSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  atomic,
  directory,
  lock,
  read,
  safePath,
  syncDir,
  within,
} from "./files.mjs";
import { instance, program, assertGeneration } from "./instance.mjs";
import { fresh, inspect, snapshot } from "./database.mjs";

const categories = [
  "Spielkonten und Rollen",
  "Sitzungen und Mitgliedschaften",
  "Geld, XP, Erfolge und Statistiken",
  "Besitz, Fahrzeuge, Personal und Patienten",
  "Einsätze, Fahrten, Funk, Warteschlangen und Weltlagen",
  "Kontenbezogene Uploads",
];
export function preview(root, request) {
  if (!/^[a-z0-9][a-z0-9_-]{3,63}$/.test(request || ""))
    throw Error("Eindeutige Reset-ID (4–64 Zeichen) erforderlich.");
  const i = instance(root);
  assertGeneration(i);
  const adoptionFile = resolve(i.state, "adoption.json");
  const adoption = existsSync(adoptionFile) ? read(adoptionFile) : null;
  return {
    request,
    instance: i.record.id,
    generation: i.record.generation,
    root: i.root,
    data: i.data,
    geodata: i.geo,
    backups: resolve(i.root, "shared/backups"),
    uploads: resolve(i.root, "shared/uploads"),
    retiredSourceBackup: adoption?.sourceData ?? null,
    categories,
    ...inspect(resolve(i.data, "game.sqlite")),
    confirmation: `RESET ${i.record.id} ${i.record.generation} ${request}`,
  };
}
export async function reset(root, request, confirmation) {
  if (!/^[a-z0-9][a-z0-9_-]{3,63}$/.test(request || ""))
    throw Error("Ungültige Reset-ID.");
  let i = instance(root);
  const receipt = resolve(i.state, "reset-" + request + ".json");
  const release = lock(resolve(i.state, "operation.lock"), "reset");
  try {
    let journal = existsSync(receipt) ? read(receipt) : null;
    if (
      journal &&
      (journal.instance !== i.record.id ||
        journal.confirmation !== confirmation)
    )
      throw Error("Reset-Bestätigung passt nicht zum ursprünglichen Auftrag.");
    if (journal?.phase === "completed")
      return { repeated: true, generation: journal.next };
    if (
      journal &&
      (journal.root !== i.root ||
        journal.backupDir !==
          resolve(i.root, "shared/backups/reset-" + request) ||
        !/^[a-f0-9-]{36}$/.test(journal.next) ||
        journal.data !== resolve(i.root, "shared/data", journal.generation))
    )
      throw Error("Resetjournal enthält widersprüchliche Zielpfade.");
    if (journal && journal.phase !== "activated")
      throw Error(
        "Reset wurde unterbrochen. Instanz bleibt gesperrt; Diagnose und ursprüngliches Journal prüfen. Keine erneute Löschung.",
      );
    if (!journal) {
      const plan = preview(root, request);
      if (plan.confirmation !== confirmation)
        throw Error(
          "Konkrete Instanz, Weltgeneration und Reset-ID müssen ausdrücklich bestätigt werden.",
        );
      // The game also keeps this legacy-compatible lock. Old launchers cannot write while resetting.
      const dataUnlock = lock(resolve(i.data, "server.lock"), "reset");
      try {
        const backupDir = directory(
          resolve(i.root, "shared/backups/reset-" + request),
        );
        journal = { ...plan, next: randomUUID(), phase: "backup", backupDir };
        atomic(receipt, journal);
        const saved = await snapshot(
          resolve(i.data, "game.sqlite"),
          resolve(backupDir, "game.sqlite"),
        );
        atomic(resolve(backupDir, "origin.json"), {
          ...saved,
          instance: i.record.id,
          generation: i.record.generation,
          release: i.current,
          purpose: "pre-reset-private-backup-not-an-active-world",
        });
        journal.phase = "backed-up";
        atomic(receipt, journal);
        console.log("Daten gesichert.");
        const target = safePath(
          i.root,
          resolve(i.root, "shared/data", journal.next),
        );
        fresh(i, program(i), target, journal.next);
        journal.phase = "prepared";
        atomic(receipt, journal);
        atomic(resolve(i.state, "instance.json"), {
          ...i.record,
          generation: journal.next,
          initialized: true,
          requiresReset: false,
        });
        journal.phase = "activated";
        atomic(receipt, journal);
      } finally {
        dataUnlock();
      }
    }
    i = instance(root);
    if (i.record.generation !== journal.next)
      throw Error("Aktivierte Welt entspricht nicht dem Resetjournal.");
    const updateJournal = resolve(i.state, "update.json");
    if (existsSync(updateJournal)) {
      const pending = read(updateJournal);
      if (["prepared", "pending-start"].includes(pending.phase))
        atomic(updateJournal, {
          ...pending,
          generation: journal.next,
          previous: null,
          backup: null,
          phase: "pending-start",
        });
    }
    // Keep old state exclusively in protected backup space. No data-directory discovery.
    if (existsSync(journal.data))
      renameSync(
        safePath(i.root, journal.data),
        resolve(journal.backupDir, "retired-world"),
      );
    const uploads = resolve(i.root, "shared/uploads");
    if (!existsSync(resolve(journal.backupDir, "uploads")))
      renameSync(uploads, resolve(journal.backupDir, "uploads"));
    directory(uploads);
    syncDir(journal.backupDir);
    if (journal.retiredSourceBackup) {
      const source = safePath(journal.retiredSourceBackup);
      if (
        within(i.root, source) ||
        within(source, i.root) ||
        within(source, i.geo) ||
        within(i.geo, source)
      )
        throw Error(
          "Alte Sicherung überschneidet sich mit der aktiven Instanz.",
        );
      const marker = read(resolve(source, "managed-instance.json"));
      if (marker.id !== i.record.id || marker.root !== i.root)
        throw Error("Alte Sicherung gehört einer anderen Instanz.");
      chmodSync(source, 0o700);
      atomic(resolve(source, "managed-instance.json"), {
        ...marker,
        purpose: "private-pre-reset-backup-only",
        reset: request,
      });
      atomic(resolve(journal.backupDir, "external-retired-backup.json"), {
        path: source,
        instance: i.record.id,
        reset: request,
      });
    }
    journal.phase = "completed";
    atomic(receipt, journal);
    console.log(
      "Einmaliger Reset abgeschlossen. Neue Registrierung erforderlich.",
    );
    return { repeated: false, generation: journal.next };
  } finally {
    release();
  }
}
export function assertNoPendingReset(i) {
  // Journals intentionally survive all database replacements.
  return import("node:fs").then(({ readdirSync }) => {
    for (const name of readdirSync(i.state).filter((n) =>
      /^reset-.*\.json$/.test(n),
    ))
      if (read(resolve(i.state, name)).phase !== "completed")
        throw Error(
          "Unterbrochener Reset. Start und Update bleiben gesperrt; Journal prüfen.",
        );
  });
}
