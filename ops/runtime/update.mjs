import { existsSync, renameSync, readdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execute } from "./child.mjs";
import { randomUUID } from "node:crypto";
import { candidate, fetchBytes } from "./channel.mjs";
import { unpack, verifyPackage } from "./archive.mjs";
import {
  assertSpace,
  atomic,
  directory,
  hash,
  lock,
  read,
  removeManaged,
} from "./files.mjs";
import { instance, program, assertGeneration } from "./instance.mjs";
import { assertNoPendingReset } from "./reset.mjs";
import {
  fresh,
  inspect,
  snapshot,
  migrate,
  restoreBeforeAdmission,
} from "./database.mjs";

export async function update(
  root,
  { resolveCandidate = candidate, download = fetchBytes } = {},
) {
  let i = instance(root);
  const release = lock(resolve(i.state, "operation.lock"), "update");
  try {
    await assertNoPendingReset(i);
    if (i.record.initialized) assertGeneration(i);
    const journalFile = resolve(i.state, "update.json");
    const prior = existsSync(journalFile) ? read(journalFile) : null;
    if (prior && !["ready", "failed", "download"].includes(prior.phase))
      throw Error(
        "Vorheriges Update noch nicht abgenommen. Start oder Diagnose ausführen.",
      );
    // An interrupted download has never changed active data. Its bounded staging area can be discarded.
    for (const entry of readdirSync(resolve(i.root, "staging")))
      if (/^[a-f0-9-]{36}$/.test(entry))
        removeManaged(i.root, resolve(i.root, "staging", entry));
    const c = await resolveCandidate();
    if (i.current?.sha256 === c.sha256) {
      console.log("Bereits aktuell. Keine Datenänderung.");
      return { unchanged: true };
    }
    if (i.current && c.sequence <= i.current.sequence)
      throw Error("Updatekanal ist älter als die installierte Version.");
    if (i.record.initialized) assertGeneration(i);
    assertSpace(i.root, c.size * 5 + 128 * 1024 * 1024);
    const work = directory(resolve(i.root, "staging", randomUUID()));
    const journal = {
      phase: "download",
      instance: i.record.id,
      generation: i.record.generation,
      candidate: c,
      previous: i.current,
      work,
    };
    atomic(journalFile, journal);
    const bytes = await download(c.url);
    if (hash(bytes) !== c.sha256)
      throw Error("Paketprüfsumme falsch. Bisherige Version erhalten.");
    const folder = resolve(work, "app"),
      manifest = unpack(bytes, folder);
    if (
      manifest.commit !== c.commit ||
      manifest.version !== c.version ||
      manifest.compatibility?.geodata !== 1 ||
      !Number.isSafeInteger(manifest.compatibility?.database) ||
      !Number.isSafeInteger(manifest.compatibility?.minimumDatabase) ||
      manifest.compatibility.minimumDatabase < 25 ||
      manifest.compatibility.database < manifest.compatibility.minimumDatabase
    )
      throw Error("Paket-/Datenkompatibilität nicht bestätigt.");
    const pointer = {
      release: manifest.version + "-" + manifest.commit,
      sha256: c.sha256,
      sequence: c.sequence,
      commit: c.commit,
    };
    const target = program(i, pointer);
    console.log("Paket geprüft.");
    if (i.record.initialized) {
      // Never replace a database still held by an old standalone server.
      const dataUnlock = lock(resolve(i.data, "server.lock"), "update");
      try {
        const details = inspect(resolve(i.data, "game.sqlite"));
        if (
          details.schema > manifest.compatibility.database ||
          details.schema < manifest.compatibility.minimumDatabase
        )
          throw Error(
            "Technische Migration erforderlich; dieses Paket unterstützt keinen ungeprüften Schemawechsel.",
          );
        journal.backup = await snapshot(
          resolve(i.data, "game.sqlite"),
          resolve(
            directory(resolve(i.root, "shared/backups/update-" + randomUUID())),
            "game.sqlite",
          ),
        );
        const rehearsal = resolve(work, "migration-preview.sqlite");
        copyFileSync(journal.backup.file, rehearsal);
        migrate(rehearsal, folder, manifest.compatibility);
      } finally {
        dataUnlock();
      }
      console.log("Daten gesichert.");
    }
    // No source checkout overlay. Each candidate is complete and isolated.
    if (existsSync(target)) {
      if (verifyPackage(target).commit !== manifest.commit)
        throw Error("Versionsordner widersprüchlich.");
      removeManaged(i.root, folder);
    } else renameSync(folder, target);
    if (!existsSync(resolve(i.geo, "manifest.json"))) {
      const { installGeodata } = await import(
        pathToFileURL(resolve(target, "scripts/geodata/download-package.mjs"))
          .href
      );
      await installGeodata({ target: i.geo, programRoot: target });
    }
    if (!i.env.GRAPHHOPPER_URL)
      await execute(
        resolve(target, "scripts/geodata/pipeline.mjs"),
        ["tools"],
        { cwd: target, env: i.env },
      );
    if (!i.record.initialized) {
      fresh(i, target);
      i.record.initialized = true;
      atomic(resolve(i.state, "instance.json"), i.record);
    } else {
      journal.phase = "migrating";
      atomic(journalFile, journal);
      const dataUnlock = lock(
        resolve(i.data, "server.lock"),
        "update-migration",
      );
      try {
        migrate(resolve(i.data, "game.sqlite"), target, manifest.compatibility);
      } catch (error) {
        restoreBeforeAdmission(i, journal.backup);
        journal.phase = "failed";
        atomic(journalFile, journal);
        throw error;
      } finally {
        dataUnlock();
      }
    }
    journal.next = pointer;
    journal.phase = "prepared";
    atomic(journalFile, journal);
    if (i.current) atomic(resolve(i.root, "previous.json"), i.current);
    atomic(resolve(i.root, "current.json"), pointer);
    journal.phase = "pending-start";
    atomic(journalFile, journal);
    console.log(
      "Version aktiviert. Über AMP starten; Bereitschaft wird geprüft.",
    );
    return { unchanged: false, release: pointer.release };
  } catch (error) {
    console.error("Update fehlgeschlagen; vorhandene Daten bleiben erhalten.");
    throw error;
  } finally {
    release();
  }
}
export function acceptReady(i) {
  const file = resolve(i.state, "update.json");
  if (existsSync(file)) {
    const j = read(file);
    if (
      !["ready", "failed", "download", "pending-start", "prepared"].includes(
        j.phase,
      )
    )
      throw Error("Updatejournal benötigt Klärung.");
    if (j.phase === "pending-start" || j.phase === "prepared") {
      if (
        j.generation !== i.record.generation ||
        j.next?.commit !== i.current.commit
      )
        throw Error("Bereitschaft gehört nicht zur vorgesehenen Welt/Version.");
      atomic(file, {
        ...j,
        phase: "ready",
        acceptedAt: new Date().toISOString(),
      });
    }
  }
  atomic(resolve(i.state, "last-good.json"), i.current);
}
export function rollbackBeforeReady(i) {
  const file = resolve(i.state, "update.json");
  if (!existsSync(file)) return false;
  const j = read(file);
  if (
    !["prepared", "pending-start"].includes(j.phase) ||
    !j.previous ||
    j.generation !== i.record.generation
  )
    return false;
  // Restore a schema-changing update only before any player was admitted.
  const details = inspect(resolve(i.data, "game.sqlite"));
  if (
    details.schema !==
    read(resolve(program(i, j.previous), "release.json")).compatibility.database
  ) {
    if (!j.backup) throw Error("Rollback benötigt eine geprüfte Sicherung.");
    const release = lock(resolve(i.data, "server.lock"), "rollback");
    try {
      restoreBeforeAdmission(i, j.backup);
    } finally {
      release();
    }
  }
  atomic(resolve(i.root, "current.json"), j.previous);
  atomic(file, { ...j, phase: "failed", rollback: "before-player-admission" });
  console.error(
    "Start fehlgeschlagen; letzte Programmversion wieder aktiviert. Über AMP erneut starten.",
  );
  return true;
}
export function cleanup(i) {
  const keep = new Set([i.current?.release]);
  for (const f of ["previous.json", "shared/state/last-good.json"])
    if (existsSync(resolve(i.root, f)))
      keep.add(read(resolve(i.root, f)).release);
  for (const n of readdirSync(resolve(i.root, "releases")))
    if (/^\d+\.\d+\.\d+-[a-f0-9]{40}$/.test(n) && !keep.has(n))
      removeManaged(i.root, resolve(i.root, "releases", n));
  // Backups and all journals deliberately have no automatic deletion policy.
  for (const n of readdirSync(resolve(i.root, "staging")))
    if (/^[a-f0-9-]{36}$/.test(n))
      removeManaged(i.root, resolve(i.root, "staging", n));
}
